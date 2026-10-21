package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.CancellationException

/** Helpers shared by the Files-list and reader thumbnail lanes; every failure is a coded error without paths. */
object RenderSupport {
  const val JPEG_QUALITY = 80

  /** Coded errors and cancellation pass through; anything else gets a fixed message (no paths) as ERR_IO. */
  suspend fun <T> mapErrors(block: suspend () -> T): T =
    try {
      block()
    } catch (e: CodedException) {
      throw e
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      throw IoCodedException(cause = e)
    }

  /**
   * Missing → ERR_FILE_NOT_FOUND, except where it may only be hidden from us ([MissingFiles]: no
   * storage access right now) → ERR_PERMISSION_DENIED, so the file's row is kept.
   */
  fun statOrThrow(context: Context, uri: Uri): UriStat =
    try {
      PdfFileInfos.stat(context, uri) ?: throw missingError(context, uri)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    }

  private fun missingError(context: Context, uri: Uri): CodedException {
    val hidden = MissingFiles.mayBeHidden(
      scheme = uri.scheme,
      path = uri.path,
      authority = uri.authority,
      volumeRoots = Volumes.mounted(context).map { it.root.absolutePath },
      hasStorageAccess = StorageAccess.has(context),
    )
    return if (hidden) PermissionDeniedException() else FileNotFoundCodedException()
  }

  fun openFd(context: Context, uri: Uri): ParcelFileDescriptor =
    try {
      context.contentResolver.openFileDescriptor(uri, "r") ?: throw FileNotFoundCodedException()
    } catch (e: java.io.FileNotFoundException) {
      // A file on a removed SD card is not gone: report it as unavailable so its row is kept.
      val file = if (uri.scheme == "file") uri.path?.let(::File) else null
      if (file != null && Volumes.isOnUnavailableVolume(file, Volumes.mounted(context))) {
        throw VolumeUnavailableException(cause = e)
      }
      throw FileNotFoundCodedException(cause = e)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    } catch (e: IllegalArgumentException) {
      // Unknown document id.
      throw FileNotFoundCodedException(cause = e)
    }

  /** Opens [uri] read-only; the returned renderer owns the descriptor and closes it. */
  fun openRenderer(context: Context, uri: Uri): PdfRenderer {
    val fd = openFd(context, uri)
    return try {
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
  }

  /**
   * Renders 1-based [page] at [width] px on white (height follows the page aspect, capped at 2 × width)
   * into [target] as JPEG. A page out of range is ERR_PDF_INVALID.
   */
  fun renderPageJpeg(renderer: PdfRenderer, page: Int, width: Int, target: File) {
    if (page < 1 || page > renderer.pageCount) throw PdfInvalidException("Page $page out of range")
    renderer.openPage(page - 1).use { pdfPage ->
      val height = (width.toLong() * pdfPage.height / pdfPage.width.coerceAtLeast(1))
        .coerceIn(1L, 2L * width)
        .toInt()
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      try {
        bitmap.eraseColor(Color.WHITE)
        pdfPage.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        writeJpeg(bitmap, File(target.parentFile, "${target.name}.part"), target)
      } finally {
        bitmap.recycle()
      }
    }
  }

  /** JPEG via a .part file; any failure (disk full, compress refused) deletes it and throws ERR_IO. */
  fun writeJpeg(bitmap: Bitmap, part: File, target: File) {
    try {
      val written = FileOutputStream(part).use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out) }
      if (!written || !part.renameTo(target)) throw IoCodedException("Could not write thumbnail")
    } catch (e: IOException) {
      throw IoCodedException("Could not write thumbnail", e)
    } finally {
      if (part.exists()) part.delete()
    }
  }

  fun ParcelFileDescriptor.closeQuietly() {
    try {
      close()
    } catch (_: IOException) {
    }
  }
}
