package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Page count and first-page thumbnails via [PdfRenderer]. Every renderer use is serialized through
 * one process-wide [Mutex] (PdfRenderer is not thread-safe and holds native memory).
 */
class Thumbnails(private val context: Context) {
  suspend fun pageCount(uri: String, password: String?): Int {
    if (password != null) throw PasswordUnsupportedException()
    return withRenderer(Uri.parse(uri)) { it.pageCount }
  }

  /** [page] is 1-based. Returns a file:// URI of a cached JPEG. */
  suspend fun generate(uri: String, page: Int, width: Int): String = withContext(Dispatchers.IO) {
    val parsed = Uri.parse(uri)
    val stat = statOrThrow(parsed)
    val targetWidth = width.coerceIn(1, MAX_WIDTH)
    val dir = File(context.cacheDir, "thumbs").apply { mkdirs() }
    val target = File(dir, "${ThumbKey.of(uri, stat.sizeBytes, stat.modifiedAt, page, targetWidth)}.jpg")
    if (target.isFile && target.length() > 0) return@withContext Uri.fromFile(target).toString()

    withRenderer(parsed) { renderer ->
      if (page < 1 || page > renderer.pageCount) throw PdfInvalidException("Page $page out of range")
      renderer.openPage(page - 1).use { pdfPage ->
        val height = (targetWidth.toLong() * pdfPage.height / pdfPage.width.coerceAtLeast(1))
          .coerceIn(1L, 2L * targetWidth)
          .toInt()
        val bitmap = Bitmap.createBitmap(targetWidth, height, Bitmap.Config.ARGB_8888)
        try {
          bitmap.eraseColor(Color.WHITE)
          pdfPage.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          val part = File(dir, "${target.name}.part")
          FileOutputStream(part).use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out) }
          if (!part.renameTo(target)) {
            part.delete()
            throw IOException("Could not write thumbnail")
          }
        } finally {
          bitmap.recycle()
        }
      }
    }
    Uri.fromFile(target).toString()
  }

  private fun statOrThrow(uri: Uri): UriStat =
    try {
      PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    }

  private suspend fun <T> withRenderer(uri: Uri, block: (PdfRenderer) -> T): T = withContext(Dispatchers.IO) {
    rendererLock.withLock {
      val fd = openFd(uri)
      val renderer = try {
        PdfRenderer(fd)
      } catch (e: SecurityException) {
        fd.closeQuietly()
        throw PdfEncryptedException(cause = e)
      } catch (e: IOException) {
        fd.closeQuietly()
        throw PdfInvalidException(cause = e)
      } catch (e: IllegalArgumentException) {
        fd.closeQuietly()
        throw PdfInvalidException(cause = e)
      }
      // PdfRenderer owns fd from here and closes it.
      renderer.use(block)
    }
  }

  private fun openFd(uri: Uri): ParcelFileDescriptor =
    try {
      context.contentResolver.openFileDescriptor(uri, "r") ?: throw FileNotFoundCodedException()
    } catch (e: java.io.FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    } catch (e: IllegalArgumentException) {
      // Unknown document id.
      throw FileNotFoundCodedException(cause = e)
    }

  private fun ParcelFileDescriptor.closeQuietly() {
    try {
      close()
    } catch (_: IOException) {
    }
  }

  private companion object {
    val rendererLock = Mutex()
    const val JPEG_QUALITY = 80
    const val MAX_WIDTH = 2048
  }
}
