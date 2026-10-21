package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.storage.StorageManager
import expo.modules.kotlin.exception.CodedException
import java.io.File

/** A mounted volume root; [label] is null for primary storage, else its description (e.g. "SD card"). */
data class Volume(val root: File, val label: String?)

object Volumes {
  /** Every mounted volume root; unmounted volumes (null app dirs) are dropped. Primary first. */
  fun mountedVolumeRoots(context: Context): List<Pair<File, String?>> {
    val storageManager = context.getSystemService(StorageManager::class.java)
    return context.getExternalFilesDirs(null).withIndex().mapNotNull { (index, appDir) ->
      val rootPath = ScanRules.volumeRootFromAppDir(appDir?.absolutePath) ?: return@mapNotNull null
      val root = File(rootPath)
      val label = if (index == 0) null else storageManager?.getStorageVolume(root)?.getDescription(context)
      root to label
    }
  }

  fun mounted(context: Context): List<Volume> = mountedVolumeRoots(context).map { Volume(it.first, it.second) }

  /** The mounted volume containing [file] (longest root match), or null. */
  fun volumeOf(file: File, volumes: List<Volume>): Volume? {
    val path = file.absolutePath
    return volumes
      .filter { path == it.root.absolutePath || path.startsWith(it.root.absolutePath + "/") }
      .maxByOrNull { it.root.absolutePath.length }
  }

  /**
   * True when [file] lives under shared storage (/storage or /mnt) but on no mounted volume, e.g.
   * a removed SD card. Such a file is not gone: its index row (favourite, bookmarks) must stay.
   */
  fun isOnUnavailableVolume(file: File, volumes: List<Volume>): Boolean {
    val path = file.absolutePath
    val shared = SHARED_STORAGE_PREFIXES.any { path.startsWith(it) }
    return shared && volumeOf(file, volumes) == null
  }

  /** The coded error for a file:// target that does not exist (never carries the path). */
  fun missingFileError(file: File, volumes: List<Volume>): CodedException =
    if (isOnUnavailableVolume(file, volumes)) VolumeUnavailableException() else FileNotFoundCodedException()

  private val SHARED_STORAGE_PREFIXES = listOf("/storage/", "/mnt/")

  /** Path of [dir] relative to its volume root ('' for the root itself). */
  fun relativeTo(volume: Volume, dir: File): String =
    dir.absolutePath.removePrefix(volume.root.absolutePath).trim('/')

  fun uriOf(file: File): String = Uri.fromFile(file).toString()
}
