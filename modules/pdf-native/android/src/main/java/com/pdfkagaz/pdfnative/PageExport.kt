package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * PDF to images: renders single pages of a tool workspace file (a decrypted copy when the input
 * was locked) to `img-<page>.<ext>` in the same workspace, on white, ARGB_8888, sized by
 * [RenderSizing]. One lane ([lock]); the renderer of the last file stays open between pages and
 * the page bitmap is reused while the size matches. [release] closes both.
 */
class PageExport(private val context: Context) {
  /**
   * [page] is 1-based, [dpi] 72 / 150 / 300, [format] "jpg" (quality 90) or "png". Only files of
   * job [jobId]'s workspace (else ERR_PERMISSION_DENIED); [check] throws when the job is cancelled.
   * Returns `{ uri, page, width, height, reduced }`.
   */
  suspend fun render(fileUri: String, jobId: String, page: Int, dpi: Int, format: String, check: () -> Unit): Map<String, Any?> =
    RenderSupport.mapErrors {
      withContext(Dispatchers.IO) {
        if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
        if (dpi !in DPIS) throw InvalidNameException("Unsupported DPI")
        val compress = when (format) {
          "jpg" -> Bitmap.CompressFormat.JPEG
          "png" -> Bitmap.CompressFormat.PNG
          else -> throw InvalidNameException("Unsupported image format")
        }
        val source = ToolFiles.workspaceFile(context, Uri.parse(fileUri))
        val dir = source.parentFile ?: throw PermissionDeniedException()
        if (dir.name != jobId) throw PermissionDeniedException()
        if (!source.isFile) throw FileNotFoundCodedException()
        lock.withLock {
          check()
          val renderer = rendererFor(source)
          if (page < 1 || page > renderer.pageCount) throw PdfInvalidException("Page out of range")
          // Page sizes are in points and already turned by the page's /Rotate, as is the render.
          val (size, image) = renderer.openPage(page - 1).use { pdfPage ->
            val size = RenderSizing.sizeFor(pdfPage.width.toFloat(), pdfPage.height.toFloat(), dpi)
            val image = bitmapFor(size.width, size.height)
            image.eraseColor(Color.WHITE)
            pdfPage.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            size to image
          }
          check()
          val target = File(dir, "img-$page.$format")
          write(image, compress, File(dir, ToolPaths.partName(target.name)), target)
          mapOf(
            "uri" to Uri.fromFile(target).toString(),
            "page" to page,
            "width" to size.width,
            "height" to size.height,
            "reduced" to size.reduced,
          )
        }
      }
    }

  /** Closes the open renderer and frees the page bitmap; safe to call when none is open. */
  suspend fun release() = withContext(Dispatchers.IO) {
    lock.withLock {
      closeCurrent()
      bitmap?.recycle()
      bitmap = null
    }
  }

  /** Caller holds [lock]. Reopens when the file (or its size / modification time) changed. */
  private fun rendererFor(file: File): PdfRenderer {
    val key = OpenKey(file.path, file.length(), file.lastModified())
    current?.let { if (it.key == key) return it.renderer }
    closeCurrent()
    return RenderSupport.openRenderer(context, Uri.fromFile(file)).also { current = OpenDocument(key, it) }
  }

  /** Caller holds [lock]. The kept bitmap when its size matches, else a new one (the old is recycled). */
  private fun bitmapFor(width: Int, height: Int): Bitmap {
    bitmap?.let { if (!it.isRecycled && it.width == width && it.height == height) return it }
    bitmap?.recycle()
    bitmap = null
    return try {
      Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap = it }
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException("Not enough memory to render the page")
    }
  }

  /** Via the part file, renamed into place; a failure deletes it and throws ERR_IO. */
  private fun write(bitmap: Bitmap, format: Bitmap.CompressFormat, part: File, target: File) {
    try {
      val written = FileOutputStream(part).use { out -> bitmap.compress(format, JPEG_QUALITY, out) }
      if (!written || !part.renameTo(target)) throw IoCodedException("Could not write the image")
    } catch (e: IOException) {
      throw IoCodedException("Could not write the image", e)
    } finally {
      if (part.exists()) part.delete()
    }
  }

  private fun closeCurrent() {
    val open = current ?: return
    current = null
    try {
      open.renderer.close()
    } catch (_: IllegalStateException) {
      // Already closed.
    }
  }

  private data class OpenKey(val path: String, val sizeBytes: Long, val modifiedAt: Long)

  private class OpenDocument(val key: OpenKey, val renderer: PdfRenderer)

  companion object {
    /** JPEG quality (PNG ignores it). */
    const val JPEG_QUALITY = 90

    val DPIS = setOf(72, 150, 300)

    /** Serializes every page export; apart from the reader, Files-list and tool thumbnail lanes. */
    val lock = Mutex()

    /** Guarded by [lock]; process-wide so a recreated module still releases them. */
    private var current: OpenDocument? = null
    private var bitmap: Bitmap? = null
  }
}
