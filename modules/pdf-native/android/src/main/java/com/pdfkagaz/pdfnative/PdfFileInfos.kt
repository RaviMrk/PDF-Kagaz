package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.provider.MediaStore
import java.io.File

/** Name, size and modification time (epoch ms) of a file:// or content:// URI. */
data class UriStat(val name: String, val sizeBytes: Long, val modifiedAt: Long)

/** Where a SAF document lives: its parent folder's document URI, display folder and modification time. */
data class SafLocation(val parentUri: String, val folder: String, val parentModifiedAt: Long)

/** Builds PdfFileInfo maps (see PdfNative.types.ts) for file://, SAF document and MediaStore URIs. */
object PdfFileInfos {
  fun ofFile(file: File, volumes: List<Volume>): Map<String, Any?> {
    val parent = file.parentFile ?: file
    val volume = Volumes.volumeOf(parent, volumes)
    val folder = if (volume == null) {
      parent.absolutePath.trim('/')
    } else {
      ScanRules.displayFolder(Volumes.relativeTo(volume, parent), volume.label)
    }
    return info(Volumes.uriOf(file), file.name, folder, Volumes.uriOf(parent), parent.lastModified(), file.length(), file.lastModified())
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

  /** Null when the file / document does not exist. SecurityException (no grant) propagates. */
  fun stat(context: Context, uri: Uri): UriStat? {
    if (uri.scheme == "file") {
      val file = File(uri.path ?: return null)
      return if (file.isFile) UriStat(file.name, file.length(), file.lastModified()) else null
    }
    val isDocument = DocumentsContract.isDocumentUri(context, uri)
    val projection = if (isDocument) {
      arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED)
    } else {
      arrayOf(MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED)
    }
    return try {
      context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
        if (!c.moveToFirst()) return null
        val modified = if (c.isNull(2)) 0L else c.getLong(2)
        UriStat(
          name = c.getString(0) ?: "",
          sizeBytes = if (c.isNull(1)) 0L else c.getLong(1),
          // MediaStore DATE_MODIFIED is in seconds.
          modifiedAt = if (isDocument) modified else modified * 1000L,
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
