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
 * Page thumbnails and page count of tool inputs (the organiser grid). Reads only files staged in
 * the private tool workspace ([ToolFiles.workspaceFile]); JPEGs go to cacheDir/[ToolPaths.THUMB_DIR],
 * which the FileProvider does not expose. Its own [lock] and cached [PdfRenderer] keep it apart
 * from the Files-list ([Thumbnails]) and reader ([ReaderThumbnails]) lanes.
 */
class ToolThumbnails(private val context: Context) {
  /** [page] is 1-based; [fileUri] a workspace file:// URI. Returns a file:// URI of a cached JPEG. */
  suspend fun render(fileUri: String, page: Int, width: Int): String = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val startedIn = lock.withLock { generation }
      val doc = open(fileUri)
      val targetWidth = width.coerceIn(1, MAX_WIDTH)
      val dir = File(context.cacheDir, ToolPaths.THUMB_DIR).apply { mkdirs() }
      val target = File(dir, "${ThumbKey.of(doc.key.uri, doc.key.sizeBytes, doc.key.modifiedAt, page, targetWidth)}.jpg")
      if (!(target.isFile && target.length() > 0)) {
        withRenderer(doc, startedIn) { RenderSupport.renderPageJpeg(it, page, targetWidth, target) }
      }
      Uri.fromFile(target).toString()
    }
  }

  /** Page count of a workspace file; encrypted → ERR_PDF_ENCRYPTED, damaged → ERR_PDF_INVALID. */
  suspend fun pageCount(fileUri: String): Int = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val startedIn = lock.withLock { generation }
      val doc = open(fileUri)
      withRenderer(doc, startedIn) { it.pageCount }
    }
  }

  /** Closes the cached renderer and its descriptor; safe to call when none is open. */
  suspend fun release() = withContext(Dispatchers.IO) {
    lock.withLock {
      generation++
      closeCurrent()
    }
  }

  private class Target(val key: OpenKey, val uri: Uri)

  /** Refuses anything but a workspace file (ERR_PERMISSION_DENIED); missing → ERR_FILE_NOT_FOUND. */
  private fun open(fileUri: String): Target {
    val file = ToolFiles.workspaceFile(context, Uri.parse(fileUri))
    if (!file.isFile) throw FileNotFoundCodedException()
    val uri = Uri.fromFile(file)
    return Target(OpenKey(uri.toString(), file.length(), file.lastModified()), uri)
  }

  private suspend fun <T> withRenderer(doc: Target, startedIn: Long, block: (PdfRenderer) -> T): T =
    lock.withLock {
      if (generation == startedIn) {
        block(rendererFor(doc))
      } else {
        // Released while this call was queued: use the document once without keeping it open.
        RenderSupport.openRenderer(context, doc.uri).use(block)
      }
    }

  /** Caller holds [lock]. Reopens when the file (or its size / modification time) changed. */
  private fun rendererFor(doc: Target): PdfRenderer {
    current?.let { if (it.key == doc.key) return it.renderer }
    closeCurrent()
    return RenderSupport.openRenderer(context, doc.uri).also { current = OpenDocument(doc.key, it) }
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
    /** Serializes every use of the tool renderer; separate from the reader and Files-list locks. */
    val lock = Mutex()

    /** Guarded by [lock]; process-wide so a recreated module still releases it. */
    private var current: OpenDocument? = null

    /** Guarded by [lock]; bumped by every release so calls queued before it do not reopen. */
    private var generation = 0L

    private const val MAX_WIDTH = 512
  }
}
