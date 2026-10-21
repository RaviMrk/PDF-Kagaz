package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Page thumbnails for the open reader document. Its own [lock] keeps them from queueing behind the
 * Files-list jobs of [Thumbnails]; one [PdfRenderer] stays open for the last document so that
 * scrolling through pages does not reopen the file for every thumbnail.
 */
class ReaderThumbnails(private val context: Context) {
  /** [page] is 1-based; [fileUri] is the prepared file:// URI. Returns a file:// URI of a cached JPEG. */
  suspend fun render(fileUri: String, page: Int, width: Int): String = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val parsed = Uri.parse(fileUri)
      val stat = RenderSupport.statOrThrow(context, parsed)
      val targetWidth = width.coerceIn(1, MAX_WIDTH)
      val dir = File(context.cacheDir, "thumbs").apply { mkdirs() }
      val target = File(dir, "${ThumbKey.of(fileUri, stat.sizeBytes, stat.modifiedAt, page, targetWidth)}.jpg")
      if (!(target.isFile && target.length() > 0)) {
        lock.withLock {
          RenderSupport.renderPageJpeg(rendererFor(fileUri, parsed, stat), page, targetWidth, target)
        }
      }
      Uri.fromFile(target).toString()
    }
  }

  /** Closes the cached renderer and its descriptor; safe to call when none is open. */
  suspend fun release() = withContext(Dispatchers.IO) { lock.withLock { closeCurrent() } }

  /** Caller holds [lock]. Reopens when the document (or its size / modification time) changed. */
  private fun rendererFor(fileUri: String, parsed: Uri, stat: UriStat): PdfRenderer {
    val key = OpenKey(fileUri, stat.sizeBytes, stat.modifiedAt)
    current?.let { if (it.key == key) return it.renderer }
    closeCurrent()
    return RenderSupport.openRenderer(context, parsed).also { current = OpenDocument(key, it) }
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

  private data class OpenKey(val uri: String, val sizeBytes: Long, val modifiedAt: Long)

  private class OpenDocument(val key: OpenKey, val renderer: PdfRenderer)

  companion object {
    /** Serializes every use of the reader renderer; separate from the Files-list thumbnail lock. */
    val lock = Mutex()

    /** Guarded by [lock]; process-wide so a recreated module still releases it. */
    private var current: OpenDocument? = null

    private const val MAX_WIDTH = 512
  }
}
