package com.pdfkagaz.pdfnative

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.IOException
import java.io.InputStream

/**
 * MediaStore items the app creates without full storage access: inserted pending (hidden), written,
 * then published. Blocking — call off the main thread.
 */
internal class MediaStoreFiles(private val context: Context) {
  private val resolver get() = context.contentResolver

  /** A new pending PDF item named [name] under [relativePath]; MediaStore makes a taken name unique. */
  fun insertPending(name: String, relativePath: String): Uri {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw PermissionDeniedException("Storage permission required")
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, PDF_MIME)
      put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    return resolver.insert(MediaStore.Files.getContentUri("external"), values)
      ?: throw PermissionDeniedException("Could not create file")
  }

  /** Writes [source] into pending item [created], fsynced before it can be published. */
  fun write(created: Uri, source: InputStream) {
    source.use { inp ->
      val pfd = resolver.openFileDescriptor(created, "w") ?: throw IOException("No output stream")
      DurableWrites.writeFd(pfd, requireSync = true) { out -> inp.copyTo(out) }
    }
  }

  /**
   * Clears IS_PENDING. A pending item is hidden and auto-deleted by the system, so if it does not
   * take effect this throws — callers then roll back instead of deleting the source.
   */
  fun publish(created: Uri) {
    val updated = resolver.update(created, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    if (updated == 0 || isPending(created)) throw IoCodedException("Could not finish writing the file")
  }

  fun delete(created: Uri) {
    runCatching { resolver.delete(created, null, null) }
  }

  fun relativePathOf(uri: Uri): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    return resolver.query(uri, arrayOf(MediaStore.MediaColumns.RELATIVE_PATH), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }
  }

  /** PdfFileInfo map of a MediaStore item. */
  fun info(uri: Uri): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val relativePath = relativePathOf(uri) ?: APP_RELATIVE_PATH
    val dir = File(Environment.getExternalStorageDirectory(), relativePath.trimEnd('/'))
    return PdfFileInfos.ofMediaStore(uri, stat, dir, Volumes.mounted(context))
  }

  private fun isPending(uri: Uri): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return resolver.query(uri, arrayOf(MediaStore.MediaColumns.IS_PENDING), null, null, null)?.use { c ->
      !c.moveToFirst() || c.getInt(0) != 0
    } ?: true
  }

  companion object {
    const val PDF_MIME = "application/pdf"
    const val APP_FOLDER = "PDFToolkit"
    const val APP_RELATIVE_PATH = "Documents/PDFToolkit/"
  }
}
