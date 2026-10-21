package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import java.io.File

/** Name, size and modification time (epoch ms) of a file:// or content:// URI. */
data class UriStat(val name: String, val sizeBytes: Long, val modifiedAt: Long)

/** Where a SAF document lives: its parent folder's document URI, display folder and modification time. */
data class SafLocation(val parentUri: String, val folder: String, val parentModifiedAt: Long)

/** Builds PdfFileInfo maps (see PdfNative.types.ts) for file://, SAF document and MediaStore URIs. */
object PdfFileInfos {
  /** [parentModifiedAt] lets a scan stat each folder once instead of once per file. */
  fun ofFile(file: File, volumes: List<Volume>, parentModifiedAt: (File) -> Long = { it.lastModified() }): Map<String, Any?> {
    val parent = file.parentFile ?: file
    val volume = Volumes.volumeOf(parent, volumes)
    val folder = if (volume == null) {
      parent.absolutePath.trim('/')
    } else {
      ScanRules.displayFolder(Volumes.relativeTo(volume, parent), volume.label)
    }
    return info(Volumes.uriOf(file), file.name, folder, Volumes.uriOf(parent), parentModifiedAt(parent), file.length(), file.lastModified())
  }

  /** A SAF document; [location] null when the provider cannot tell where it lives. */
  fun ofDocument(uri: Uri, stat: UriStat, location: SafLocation?): Map<String, Any?> =
    info(uri.toString(), stat.name, location?.folder ?: "", location?.parentUri ?: "", location?.parentModifiedAt ?: 0L, stat.sizeBytes, stat.modifiedAt)

  /** A MediaStore item stored under [dir] (its RELATIVE_PATH on the primary volume). */
  fun ofMediaStore(uri: Uri, stat: UriStat, dir: File, volumes: List<Volume>): Map<String, Any?> {
    val volume = Volumes.volumeOf(dir, volumes)
    val folder = if (volume == null) dir.absolutePath.trim('/') else ScanRules.displayFolder(Volumes.relativeTo(volume, dir), volume.label)
    return info(uri.toString(), stat.name, folder, Volumes.uriOf(dir), dir.lastModified(), stat.sizeBytes, stat.modifiedAt)
  }

  private fun info(uri: String, name: String, folder: String, parentUri: String, parentModifiedAt: Long, size: Long, modified: Long) =
    mapOf(
      "uri" to uri,
      "name" to name,
      "folder" to folder,
      "parentUri" to parentUri,
      "parentModifiedAt" to parentModifiedAt,
      "sizeBytes" to size,
      "modifiedAt" to modified,
    )

  /**
   * Null when the file / document does not exist. SecurityException (no grant) propagates; a
   * file:// path on an unmounted volume (removed SD card) throws ERR_VOLUME_UNAVAILABLE.
   */
  fun stat(context: Context, uri: Uri): UriStat? {
    if (uri.scheme == "file") {
      val file = File(uri.path ?: return null)
      if (file.isFile) return UriStat(file.name, file.length(), file.lastModified())
      if (Volumes.isOnUnavailableVolume(file, Volumes.mounted(context))) throw VolumeUnavailableException()
      return null
    }
    val kind = StatColumns.kindOf(DocumentsContract.isDocumentUri(context, uri), uri.authority)
    return try {
      context.contentResolver.query(uri, StatColumns.projection(kind), null, null, null)?.use { c ->
        if (!c.moveToFirst()) return null
        // Read by name: providers may omit or reorder columns (FileProvider returns only name + size).
        fun long(column: String?): Long? {
          val i = if (column == null) -1 else c.getColumnIndex(column)
          return if (i < 0 || c.isNull(i)) null else c.getLong(i)
        }
        val nameIndex = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        StatColumns.toStat(
          kind,
          name = if (nameIndex < 0) null else c.getString(nameIndex),
          size = long(OpenableColumns.SIZE),
          modified = long(StatColumns.modifiedColumn(kind)),
        )
      }
    } catch (e: java.io.FileNotFoundException) {
      null
    } catch (e: IllegalArgumentException) {
      // Providers report unknown document ids this way.
      null
    }
  }

  /** Parent folder of a tree-based document URI. Needs DocumentsContract.findDocumentPath (API 26). */
  fun safLocation(context: Context, docUri: Uri): SafLocation? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !isTreeDocument(docUri)) return null
    val ids = try {
      DocumentsContract.findDocumentPath(context.contentResolver, docUri)?.path
    } catch (e: Exception) {
      // UnsupportedOperationException from providers without findDocumentPath, etc.
      null
    } ?: return null
    if (ids.size < 2) return null
    val parentId = ids[ids.size - 2]
    val parentUri = DocumentsContract.buildDocumentUriUsingTree(docUri, parentId)
    val names = ids.subList(0, ids.size - 1).map { id ->
      stat(context, DocumentsContract.buildDocumentUriUsingTree(docUri, id))?.name ?: return null
    }
    return SafLocation(parentUri.toString(), names.joinToString("/"), stat(context, parentUri)?.modifiedAt ?: 0L)
  }

  /** Display folder and mtime of a tree-based folder document URI (nested folders need API 26, else just its name). */
  fun safFolder(context: Context, folderUri: Uri): SafLocation {
    val stat = stat(context, folderUri)
    val name = stat?.name ?: ""
    val isTreeRoot = DocumentsContract.getDocumentId(folderUri) == DocumentsContract.getTreeDocumentId(folderUri)
    val folder = if (isTreeRoot) name else safLocation(context, folderUri)?.let { "${it.folder}/$name" } ?: name
    return SafLocation(folderUri.toString(), folder, stat?.modifiedAt ?: 0L)
  }

  fun isTreeDocument(uri: Uri): Boolean {
    val segments = uri.pathSegments
    return uri.scheme == "content" && segments.size >= 4 && segments[0] == "tree" && segments[2] == "document"
  }
}
