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
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
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
  }

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
      } catch (e: SecurityException) {
        null
      } catch (e: SafWalker.SafRootUnreadableException) {
        null
      } catch (e: IllegalArgumentException) {
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
    return PdfWalker(progress::update).walk(dir).map { fileInfo(it.file, volumes) }
  }

  private fun scanTree(root: String, progress: ProgressThrottle): List<Map<String, Any?>> =
    SafWalker(context.contentResolver, progress::update).walk(Uri.parse(root))

  private fun scanChangedFolders(known: List<FolderStamp>): List<Map<String, Any?>> {
    val volumes = Volumes.mounted(context)
    val knownStamps = LinkedHashMap<String, Double>()
    for (stamp in known) {
      if (stamp.uri.startsWith("file://")) knownStamps[stamp.uri.trimEnd('/')] = stamp.modifiedAt
    }
    val candidates = LinkedHashSet<String>(knownStamps.keys)
    volumes.firstOrNull { it.label == null }?.let { primary ->
      for (rel in ScanRules.HOT_FOLDERS) {
        val dir = File(primary.root, rel)
        if (dir.isDirectory) candidates.add(Volumes.uriOf(dir))
      }
    }
    val walker = PdfWalker()
    val changes = ArrayList<Map<String, Any?>>()
    for (uri in candidates) {
      val dir = File(Uri.parse(uri).path ?: continue)
      val stamp = knownStamps[uri]
      if (!dir.isDirectory) {
        if (stamp != null) changes.add(folderChange(uri, false, 0L, emptyList()))
        continue
      }
      val modifiedAt = dir.lastModified()
      if (stamp != null && stamp.toLong() == modifiedAt) continue
      val files = walker.listDir(dir).map { fileInfo(it.file, volumes) }
      changes.add(folderChange(uri, true, modifiedAt, files))
    }
    return changes
  }

  private fun folderChange(uri: String, exists: Boolean, modifiedAt: Long, files: List<Map<String, Any?>>) =
    mapOf("uri" to uri, "exists" to exists, "modifiedAt" to modifiedAt, "files" to files)

  private fun fileInfo(file: File, volumes: List<Volume>): Map<String, Any?> {
    val parent = file.parentFile ?: file
    val volume = Volumes.volumeOf(parent, volumes)
    val folder = if (volume == null) {
      parent.absolutePath.trim('/')
    } else {
      ScanRules.displayFolder(Volumes.relativeTo(volume, parent), volume.label)
    }
    return mapOf(
      "uri" to Volumes.uriOf(file),
      "name" to file.name,
      "folder" to folder,
      "parentUri" to Volumes.uriOf(parent),
      "parentModifiedAt" to parent.lastModified(),
      "sizeBytes" to file.length(),
      "modifiedAt" to file.lastModified(),
    )
  }

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
