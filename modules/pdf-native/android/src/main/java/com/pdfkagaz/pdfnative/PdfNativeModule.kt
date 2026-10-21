package com.pdfkagaz.pdfnative

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.print.PrintManager
import android.provider.DocumentsContract
import android.provider.Settings
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.stream.Collectors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PdfNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PdfNative")

    Events(SCAN_PROGRESS_EVENT, INCOMING_PDF_EVENT)

    // A VIEW while running arrives through Linking; only PDFs shared with ACTION_SEND are reported here.
    OnNewIntent { intent ->
      val uri = IncomingPdf.streamUriOf(intent.action, intent.type, streamOf(intent)) ?: return@OnNewIntent
      sendEvent(INCOMING_PDF_EVENT, mapOf("uri" to uri))
    }

    AsyncFunction("scanPdfs") Coroutine { roots: List<String>? ->
      withContext(Dispatchers.IO) { scanPdfs(roots) }
    }

    // Parallel primitive arrays, not Records: expo converts Records with kotlin-reflect, which
    // blocks the shared AsyncFunctionQueue for seconds on the first call of each process.
    AsyncFunction("scanChangedFolders") Coroutine { uris: List<String>, modifiedAts: List<Double> ->
      withContext(Dispatchers.IO) { scanChangedFolders(ChangedFolders.knownStamps(uris, modifiedAts)) }
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

    AsyncFunction("prepareReaderFile") Coroutine { uri: String ->
      readerFiles.prepare(uri)
    }

    AsyncFunction("renderReaderThumbnail") Coroutine { fileUri: String, page: Int, width: Int ->
      readerThumbnails.render(fileUri, page, width)
    }

    AsyncFunction("releaseReaderDocument") Coroutine { ->
      readerThumbnails.release()
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

    AsyncFunction("sharePdf") Coroutine { uri: String, chooserTitle: String ->
      val shareUri = intents.shareUriOf(uri)
      withContext(Dispatchers.Main) { intents.start(appContext.currentActivity, intents.sendChooser(shareUri, chooserTitle)) }
    }

    AsyncFunction("openPdfWith") Coroutine { uri: String, chooserTitle: String ->
      val shareUri = intents.shareUriOf(uri)
      withContext(Dispatchers.Main) { intents.start(appContext.currentActivity, intents.viewChooser(shareUri, chooserTitle)) }
    }

    AsyncFunction("printPdf") Coroutine { uri: String, jobName: String ->
      val printable = RenderSupport.mapErrors {
        withContext(Dispatchers.IO) {
          UriGuard(context).requireAllowed(Uri.parse(uri)).also { RenderSupport.statOrThrow(context, it) }
        }
      }
      withContext(Dispatchers.Main) { printPdf(printable, jobName) }
    }

    AsyncFunction("takeIncomingPdf") {
      takeIncomingPdf()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resolveIncomingPdf") Coroutine { uri: String ->
      RenderSupport.mapErrors { withContext(Dispatchers.IO) { resolveIncomingPdf(Uri.parse(uri)) } }
    }

    AsyncFunction("releaseIncomingGrant") Coroutine { uri: String ->
      withContext(Dispatchers.IO) { releaseIncomingGrant(uri) }
    }

    lateinit var folderPicker: AppContextActivityResultLauncher<FolderPickerInput, Uri?>

    RegisterActivityContracts {
      folderPicker = registerForActivityResult(FolderPickerContract(this@PdfNativeModule))
    }

    AsyncFunction("pickFolder") Coroutine { ->
      val treeUri = try {
        folderPicker.launch(FolderPickerInput())
      } catch (e: SecurityException) {
        // takePersistableUriPermission refused; its message contains the URI.
        throw PermissionDeniedException(cause = e)
      } ?: return@Coroutine null
      withContext(Dispatchers.IO) {
        folderGrants.add(treeUri.toString())
        pickedFolder(treeUri)
      }
    }

    AsyncFunction("releaseFolder") Coroutine { uri: String ->
      withContext(Dispatchers.IO) { releaseFolder(uri) }
    }

    AsyncFunction("getPersistedFolderUris") Coroutine { ->
      withContext(Dispatchers.IO) {
        // Folder grants only: incoming documents also hold persisted grants.
        val roots = folderGrants.roots()
        context.contentResolver.persistedUriPermissions
          .filter { it.isReadPermission && it.uri.toString() in roots }
          .map { it.uri.toString() }
      }
    }
  }

  private val thumbnails by lazy { Thumbnails(context) }

  private val readerFiles by lazy { ReaderFiles(context) }

  private val readerThumbnails by lazy { ReaderThumbnails(context) }

  private val intents by lazy { PdfIntents(context) }

  private val folderGrants by lazy { FolderGrants(context) }

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
        files.addAll(result.files)
        scanned.add(root)
        // Subfolders that could not be listed: their rows must not be treated as deleted.
        for (uri in result.failedDirs) if (uri !in failed) failed.add(uri)
      }
      progress.endRoot()
    }
    progress.finish()
    return mapOf("files" to files, "scannedRoots" to scanned, "failedRoots" to failed)
  }

  private class RootScan(val files: List<Map<String, Any?>>, val failedDirs: List<String> = emptyList())

  /** Null when the root cannot be listed. */
  private fun scanFileRoot(root: String, volumes: List<Volume>, progress: ProgressThrottle): RootScan? {
    val dir = File(Uri.parse(root).path ?: return null)
    if (!dir.isDirectory || dir.listFiles() == null) return null
    val walker = PdfWalker(onProgress = progress::update, parallelism = WALK_PARALLELISM)
    // Each file costs ~3 stats through FUSE: map in parallel and stat each folder once.
    val folderTimes = ConcurrentHashMap<String, Long>()
    val found = walker.walk(dir)
      .parallelStream()
      .map { PdfFileInfos.ofFile(it.file, volumes) { parent -> folderTimes.getOrPut(parent.path) { parent.lastModified() } } }
      .collect(Collectors.toList())
    return RootScan(found, walker.failedDirs.map { Volumes.uriOf(it) })
  }

  private fun scanTree(root: String, progress: ProgressThrottle): RootScan =
    RootScan(SafWalker(context.contentResolver, progress::update).walk(Uri.parse(root)))

  private fun scanChangedFolders(knownStamps: Map<String, Long>): List<Map<String, Any?>> {
    val volumes = Volumes.mounted(context)
    val hot = volumes.firstOrNull { it.label == null }?.let { primary ->
      ScanRules.HOT_FOLDERS.map { Volumes.uriOf(File(primary.root, it)) }
    } ?: emptyList()
    return ChangedFolders(parallelism = WALK_PARALLELISM)
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
    val label = try {
      PdfFileInfos.stat(context, rootUri)?.name
    } catch (e: SecurityException) {
      // Grant not usable after all; its message contains the URI.
      throw PermissionDeniedException(cause = e)
    } ?: treeUri.lastPathSegment ?: ""
    return mapOf("uri" to treeUri.toString(), "label" to label)
  }

  private fun releaseFolder(uri: String) {
    releaseGrant(Uri.parse(uri))
    folderGrants.remove(uri)
  }

  private fun releaseGrant(parsed: Uri) {
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

  private fun hasAllFilesAccess(): Boolean = StorageAccess.has(context)

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

  // region share / print / incoming

  private fun printPdf(uri: Uri, jobName: String) {
    val activity = appContext.currentActivity ?: throw NoActivityException()
    val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: throw IoCodedException()
    printManager.print(jobName, PdfPrintAdapter(context, uri, jobName), null)
  }

  /**
   * The PDF the current activity was started with (ACTION_SEND stream or ACTION_VIEW data),
   * consumed so a recreate or a late Linking.getInitialURL does not reopen it. The launch VIEW is
   * delivered here, not through Linking: expo-router drops an initial URL that arrives late.
   */
  private fun takeIncomingPdf(): String? {
    val activity = appContext.currentActivity ?: return null
    val intent = activity.intent ?: return null
    val uri = IncomingPdf.launchUriOf(intent.action, intent.type, streamOf(intent), intent.dataString) ?: return null
    activity.intent = Intent(intent).setAction(Intent.ACTION_MAIN).apply {
      removeExtra(Intent.EXTRA_STREAM)
      data = null
      clipData = null
    }
    return uri
  }

  /** Our own providers and app-private files are refused, so such rows are never indexed. */
  private fun resolveIncomingPdf(source: Uri): Map<String, Any?> {
    val uri = UriGuard(context).requireAllowed(source)
    if (uri.scheme == "file") {
      // Throws ERR_VOLUME_UNAVAILABLE for a file on an unmounted volume.
      RenderSupport.statOrThrow(context, uri)
      val file = File(uri.path ?: throw FileNotFoundCodedException())
      return PdfFileInfos.ofFile(file, Volumes.mounted(context))
    }
    // Make room first, so taking this grant never makes the system prune a folder grant.
    trimIncomingGrants(keep = IncomingGrants.MAX_DOCUMENT_GRANTS - 1)
    try {
      // Keeps access across restarts when the sender granted a persistable permission; most do not.
      context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (e: SecurityException) {
      // Not persistable: the grant lasts while this activity lives.
    }
    return PdfFileInfos.ofIncoming(uri, RenderSupport.statOrThrow(context, uri))
  }

  private fun trimIncomingGrants(keep: Int) {
    val grants = context.contentResolver.persistedUriPermissions.map { PersistedGrant(it.uri.toString(), it.persistedTime) }
    for (uri in IncomingGrants.toRelease(grants, folderGrants.roots(), keep)) releaseGrant(Uri.parse(uri))
  }

  /** Releases the persisted grant of an incoming document; recorded folder grants are left alone. */
  private fun releaseIncomingGrant(uri: String) {
    if (uri in folderGrants.roots()) return
    releaseGrant(Uri.parse(uri))
  }

  private fun streamOf(intent: Intent): String? {
    val stream: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
    return stream?.toString()
  }

  // endregion

  private companion object {
    const val SCAN_PROGRESS_EVENT = "onScanProgress"
    const val INCOMING_PDF_EVENT = "onIncomingPdf"
    const val PROGRESS_INTERVAL_MS = 200L

    /** Folders listed concurrently by a full scan (readdir on shared storage is latency-bound). */
    const val WALK_PARALLELISM = 6
  }
}
