package com.pdfkagaz.pdfnative

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.SystemClock
import android.provider.DocumentsContract
import android.provider.Settings
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class FolderStamp : Record {
  @Field val uri: String = ""

  @Field val modifiedAt: Double = 0.0
}

class PdfNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PdfNative")

    Events(SCAN_PROGRESS_EVENT)

    AsyncFunction("scanPdfs") Coroutine { roots: List<String>? ->
      withContext(Dispatchers.IO) { scanPdfs(roots) }
    }

    AsyncFunction("scanChangedFolders") Coroutine { known: List<FolderStamp> ->
      withContext(Dispatchers.IO) { scanChangedFolders(known) }
    }

    AsyncFunction("hasAllFilesAccess") {
      hasAllFilesAccess()
    }

    AsyncFunction("openAllFilesAccessSettings") {
      openAllFilesAccessSettings()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("generateThumbnail") Coroutine { uri: String, page: Int, width: Int ->
      thumbnails.generate(uri, page, width)
    }

    AsyncFunction("getPageCount") Coroutine { uri: String, password: String? ->
      thumbnails.pageCount(uri, password)
    }

    AsyncFunction("renameFile") Coroutine { uri: String, newName: String ->
      withContext(Dispatchers.IO) { fileOps.rename(uri, newName) }
    }

    AsyncFunction("deleteFile") Coroutine { uri: String ->
      withContext(Dispatchers.IO) { fileOps.delete(uri) }
    }

    AsyncFunction("duplicateFile") Coroutine { uri: String, parentUri: String ->
      withContext(Dispatchers.IO) { fileOps.duplicate(uri, parentUri) }
    }

    AsyncFunction("moveToAppFolder") Coroutine { uri: String ->
      withContext(Dispatchers.IO) { fileOps.moveToAppFolder(uri) }
    }

    lateinit var folderPicker: AppContextActivityResultLauncher<FolderPickerInput, Uri?>

    RegisterActivityContracts {
      folderPicker = registerForActivityResult(FolderPickerContract(this@PdfNativeModule))
    }

    AsyncFunction("pickFolder") Coroutine { ->
      val treeUri = folderPicker.launch(FolderPickerInput()) ?: return@Coroutine null
      withContext(Dispatchers.IO) { pickedFolder(treeUri) }
    }

    AsyncFunction("releaseFolder") { uri: String ->
      releaseFolder(uri)
    }

    AsyncFunction("getPersistedFolderUris") {
      context.contentResolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri.toString() }
    }
  }

  private val thumbnails by lazy { Thumbnails(context) }

  private val fileOps by lazy { FileOps(context, ::hasAllFilesAccess) }

  // region scan

  private fun scanPdfs(roots: List<String>?): Map<String, Any?> {
    val volumes = Volumes.mounted(context)
    val rootUris = if (roots.isNullOrEmpty()) volumes.map { Volumes.uriOf(it.root) } else roots
    val progress = ProgressThrottle()
    val files = ArrayList<Map<String, Any?>>()
    val scanned = ArrayList<String>()
    val failed = ArrayList<String>()
    for (rootUri in rootUris) {
      val root = rootUri.trimEnd('/')
      val result = try {
        if (root.startsWith("content://")) scanTree(root, progress) else scanFileRoot(root, volumes, progress)
      } catch (e: CancellationException) {
        throw e
      } catch (e: Throwable) {
        // Revoked grant, provider failure, unmounted volume…: this root fails, the others still count.
        null
      }
      if (result == null) {
        failed.add(root)
      } else {
        files.addAll(result)
        scanned.add(root)
      }
      progress.endRoot()
    }
    progress.finish()
    return mapOf("files" to files, "scannedRoots" to scanned, "failedRoots" to failed)
  }

  /** Null when the root cannot be listed. */
  private fun scanFileRoot(root: String, volumes: List<Volume>, progress: ProgressThrottle): List<Map<String, Any?>>? {
    val dir = File(Uri.parse(root).path ?: return null)
    if (!dir.isDirectory || dir.listFiles() == null) return null
    return PdfWalker(progress::update).walk(dir).map { PdfFileInfos.ofFile(it.file, volumes) }
  }

  private fun scanTree(root: String, progress: ProgressThrottle): List<Map<String, Any?>> =
    SafWalker(context.contentResolver, progress::update).walk(Uri.parse(root))

  private fun scanChangedFolders(known: List<FolderStamp>): List<Map<String, Any?>> {
    val volumes = Volumes.mounted(context)
    val knownStamps = LinkedHashMap<String, Long>()
    for (stamp in known) {
      if (stamp.uri.startsWith("file://")) knownStamps[stamp.uri.trimEnd('/')] = stamp.modifiedAt.toLong()
    }
    val hot = volumes.firstOrNull { it.label == null }?.let { primary ->
      ScanRules.HOT_FOLDERS.map { Volumes.uriOf(File(primary.root, it)) }
    } ?: emptyList()
    return ChangedFolders()
      .check(
        known = knownStamps,
        hot = hot,
        toFile = { uri -> Uri.parse(uri).path?.let(::File) },
        isMounted = { dir -> Volumes.volumeOf(dir, volumes) != null },
      )
      .map { change -> folderChange(change.uri, change.exists, change.modifiedAt, change.pdfs.map { PdfFileInfos.ofFile(it.file, volumes) }) }
  }

  private fun folderChange(uri: String, exists: Boolean, modifiedAt: Long, files: List<Map<String, Any?>>) =
    mapOf("uri" to uri, "exists" to exists, "modifiedAt" to modifiedAt, "files" to files)

  /** Emits onScanProgress at most once per 200 ms, plus a final event; counts span all roots. */
  private inner class ProgressThrottle {
    private var lastEmit = 0L
    private var baseFolders = 0
    private var baseFound = 0
    private var folders = 0
    private var found = 0

    fun update(scannedFolders: Int, foundInRoot: Int) {
      folders = baseFolders + scannedFolders
      found = baseFound + foundInRoot
      val now = SystemClock.elapsedRealtime()
      if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
        lastEmit = now
        emit()
      }
    }

    fun endRoot() {
      baseFolders = folders
      baseFound = found
    }

    fun finish() = emit()

    private fun emit() {
      sendEvent(SCAN_PROGRESS_EVENT, mapOf("scannedFolders" to folders, "found" to found))
    }
  }

  // endregion

  // region folders

  private fun pickedFolder(treeUri: Uri): Map<String, Any?> {
    val rootUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
    val label = PdfFileInfos.stat(context, rootUri)?.name ?: treeUri.lastPathSegment ?: ""
    return mapOf("uri" to treeUri.toString(), "label" to label)
  }

  private fun releaseFolder(uri: String) {
    val parsed = Uri.parse(uri)
    val grant = context.contentResolver.persistedUriPermissions.firstOrNull { it.uri == parsed } ?: return
    val flags = (if (grant.isReadPermission) Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or
      (if (grant.isWritePermission) Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0)
    try {
      context.contentResolver.releasePersistableUriPermission(parsed, flags)
    } catch (e: SecurityException) {
      // Already released.
    }
  }

  // endregion

  // region access

  private fun hasAllFilesAccess(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

  private fun openAllFilesAccessSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val activity = appContext.currentActivity ?: throw NoActivityException()
    try {
      activity.startActivity(
        Intent(
          Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
          Uri.parse("package:${activity.packageName}"),
        ),
      )
    } catch (e: ActivityNotFoundException) {
      activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
    }
  }

  // endregion

  private companion object {
    const val SCAN_PROGRESS_EVENT = "onScanProgress"
    const val PROGRESS_INTERVAL_MS = 200L
  }
}
