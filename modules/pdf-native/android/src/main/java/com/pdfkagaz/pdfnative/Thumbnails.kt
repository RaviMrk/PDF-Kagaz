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
 * Page count and first-page thumbnails for the Files list via [PdfRenderer]. Every renderer use is
 * serialized through one process-wide [Mutex] (PdfRenderer is not thread-safe and holds native memory).
 */
class Thumbnails(private val context: Context) {
  suspend fun pageCount(uri: String, password: String?): Int {
    if (password != null) throw PasswordUnsupportedException()
    return RenderSupport.mapErrors { withRenderer(Uri.parse(uri)) { it.pageCount } }
  }

  /** [page] is 1-based. Returns a file:// URI of a cached JPEG. */
  suspend fun generate(uri: String, page: Int, width: Int): String = RenderSupport.mapErrors { render(uri, page, width) }

  private suspend fun render(uri: String, page: Int, width: Int): String = withContext(Dispatchers.IO) {
    val parsed = Uri.parse(uri)
    val stat = RenderSupport.statOrThrow(context, parsed)
    val targetWidth = width.coerceIn(1, MAX_WIDTH)
    val dir = File(context.cacheDir, "thumbs").apply { mkdirs() }
    val target = File(dir, "${ThumbKey.of(uri, stat.sizeBytes, stat.modifiedAt, page, targetWidth)}.jpg")
    if (target.isFile && target.length() > 0) return@withContext Uri.fromFile(target).toString()

    withRenderer(parsed) { renderer -> RenderSupport.renderPageJpeg(renderer, page, targetWidth, target) }
    Uri.fromFile(target).toString()
  }

  private suspend fun <T> withRenderer(uri: Uri, block: (PdfRenderer) -> T): T = withContext(Dispatchers.IO) {
    rendererLock.withLock {
      // PdfRenderer owns the fd and closes it.
      RenderSupport.openRenderer(context, uri).use(block)
    }
  }

  private companion object {
    val rendererLock = Mutex()
    const val MAX_WIDTH = 2048
  }
}
