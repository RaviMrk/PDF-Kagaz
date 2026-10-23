package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Filtered, upright thumbnails of image session sources; own lane ([lock]) apart from the PDF thumbnail lanes. */
class ImageThumbnails(private val context: Context) {
  /** Returns the file:// uri of a cached JPEG of src-[index] at a long side of [width] (clamped 1..512). */
  suspend fun render(sessionId: String, index: Int, width: Int, filter: String): String = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      if (!ImageFilters.isValid(filter)) throw InvalidNameException()
      val source = ImageFiles.sourceFile(context, sessionId, index)
      val w = width.coerceIn(1, ImageLimits.THUMB_MAX_WIDTH)
      // Per session, so the thumbnails go when the session is cleaned (ToolFiles.cleanWorkspace).
      val dir = File(context.cacheDir, ToolPaths.sessionThumbDir(sessionId) ?: throw InvalidNameException()).apply { mkdirs() }
      val key = ThumbKey.of(Uri.fromFile(source).toString(), source.length(), source.lastModified(), index, w)
      val target = File(dir, "$key-$filter.jpg")
      lock.withLock {
        if (!(target.isFile && target.length() > 0)) {
          ImageFiles.renderJpeg(source, w, RenderSupport.JPEG_QUALITY, filter, target) { ensureActive() }
        }
      }
      Uri.fromFile(target).toString()
    }
  }

  companion object {
    /** Serializes thumbnail decodes so at most one bitmap pair of this lane is alive. */
    val lock = Mutex()
  }
}
