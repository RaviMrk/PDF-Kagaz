package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/**
 * Image sessions (cacheDir/tools/img-<id>/src-<n>) and bounded page preparation. Sources are only
 * read; one bitmap is decoded at a time and every bitmap is recycled. Errors are coded, with no
 * names, paths or URIs.
 */
class ImageFiles(private val context: Context) {
  private val toolsRoot: File get() = File(context.cacheDir, ToolPaths.DIR)

  /** Copies [uri] into the session as src-<index> under [maxBytes]; returns index and oriented size. */
  suspend fun import(uri: String, sessionId: String, index: Int, maxBytes: Double): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      if (!ToolPaths.isImageSessionId(sessionId) || index < 0) throw InvalidNameException()
      val cap = if (maxBytes.isNaN() || maxBytes < 0) -1L else maxBytes.toLong()
      // Refused sources fail here, before their size or existence could leak.
      val source = UriGuard(context).requireAllowed(Uri.parse(uri))
      val stat = RenderSupport.statOrThrow(context, source)
      if (ToolLimits.exceedsKnownSize(stat.sizeBytes, cap)) throw TooLargeException()
      importStream(sessionId, index, cap) { StreamCopy.openGuarded(context, source) }
    }
  }

  /**
   * The import routine for a trusted stream (already guarded, or a scanner result): copies what
   * [open] returns into the session as src-<index> under [cap] bytes (negative: no cap), then checks
   * it decodes (ERR_IMAGE_INVALID). Returns index, display-oriented size and copied bytes.
   */
  suspend fun importStream(sessionId: String, index: Int, cap: Long, open: () -> InputStream): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      if (!ToolPaths.isImageSessionId(sessionId) || index < 0) throw InvalidNameException()
      val dir = File(toolsRoot, sessionId)
      if (!dir.isDirectory && !dir.mkdirs()) throw IoCodedException()
      val target = File(dir, ToolPaths.sourceName(index))
      val copied = SessionCopy.intoFile(target, open) { input, output ->
        StreamCopy.copyChunks(this, input, output, cap)
      }
      val bounds = decodeBounds(target)
      if (bounds == null) {
        target.delete()
        throw ImageInvalidException()
      }
      val (w, h) = ExifTransform.orientedSize(bounds.first, bounds.second, orientationOf(target))
      mapOf("index" to index, "width" to w, "height" to h, "sizeBytes" to copied)
    }

  /** Prepares src-<sourceIndex> as <job>/page-<pageIndex>.jpg: bounded, upright, filtered, on white. */
  suspend fun prepare(
    sessionId: String,
    sourceIndex: Int,
    jobId: String,
    pageIndex: Int,
    maxLongSidePx: Int,
    jpegQuality: Int,
    filter: String,
  ): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      if (!ToolPaths.isImageSessionId(sessionId) || !ToolPaths.isValidJobId(jobId) || sourceIndex < 0 || pageIndex < 0) {
        throw InvalidNameException()
      }
      if (!ImageFilters.isValid(filter)) throw InvalidNameException()
      val source = File(File(toolsRoot, sessionId), ToolPaths.sourceName(sourceIndex))
      if (!source.isFile) throw FileNotFoundCodedException()
      val dir = File(toolsRoot, jobId)
      if (!dir.isDirectory && !dir.mkdirs()) throw IoCodedException()
      val target = File(dir, ToolPaths.pageName(pageIndex))
      val size = renderJpeg(
        source = source,
        maxLongSide = maxLongSidePx.coerceIn(MIN_LONG_SIDE, MAX_LONG_SIDE),
        quality = jpegQuality.coerceIn(MIN_QUALITY, MAX_QUALITY),
        filter = filter,
        target = target,
        checkActive = { ensureActive() },
      )
      mapOf(
        "uri" to Uri.fromFile(target).toString(),
        "width" to size.first,
        "height" to size.second,
        "sizeBytes" to target.length(),
      )
    }
  }

  companion object {
    const val MIN_LONG_SIDE = 256
    const val MAX_LONG_SIDE = 4096
    const val MIN_QUALITY = 50
    const val MAX_QUALITY = 95

    /** Source file in an image session, or ERR_INVALID_NAME / ERR_FILE_NOT_FOUND. */
    fun sourceFile(context: Context, sessionId: String, index: Int): File {
      if (!ToolPaths.isImageSessionId(sessionId) || index < 0) throw InvalidNameException()
      val file = File(File(File(context.cacheDir, ToolPaths.DIR), sessionId), ToolPaths.sourceName(index))
      if (!file.isFile) throw FileNotFoundCodedException()
      return file
    }

    /** Bounds from the header only; null when the file is not decodable or a side is not positive. */
    fun decodeBounds(file: File): Pair<Int, Int>? {
      val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, options)
      return if (options.outWidth > 0 && options.outHeight > 0) options.outWidth to options.outHeight else null
    }

    fun orientationOf(file: File): Int =
      try {
        ExifInterface(file).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } catch (_: Exception) {
        ExifInterface.ORIENTATION_NORMAL
      }

    /**
     * Decodes [source] (sampled), draws it upright and filtered on white at a long side of at most
     * [maxLongSide] and writes a JPEG to [target] through a part file. Returns the written size.
     * [checkActive] throws when the caller was cancelled; it runs before decode and before compress.
     */
    fun renderJpeg(
      source: File,
      maxLongSide: Int,
      quality: Int,
      filter: String,
      target: File,
      checkActive: () -> Unit,
    ): Pair<Int, Int> {
      val part = File(target.parentFile, ToolPaths.partName(target.name))
      var decoded: Bitmap? = null
      var canvasBitmap: Bitmap? = null
      try {
        val bounds = decodeBounds(source) ?: throw ImageInvalidException()
        val orientation = orientationOf(source)
        val (tw, th) = ImageSizing.targetSize(bounds.first, bounds.second, maxLongSide)
        val (cw, ch) = ExifTransform.orientedSize(tw, th, orientation)
        checkActive()
        val options = BitmapFactory.Options().apply {
          inSampleSize = ImageSizing.sampleSize(bounds.first, bounds.second, maxLongSide)
          inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        decoded = BitmapFactory.decodeFile(source.path, options) ?: throw ImageInvalidException()
        canvasBitmap = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888)
        canvasBitmap.eraseColor(Color.WHITE)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        ImageFilters.matrix(filter)?.let { paint.colorFilter = ColorMatrixColorFilter(ColorMatrix(it)) }
        Canvas(canvasBitmap).drawBitmap(decoded, matrixFor(decoded.width, decoded.height, tw, th, orientation), paint)
        decoded.recycle()
        decoded = null
        checkActive()
        val written = FileOutputStream(part).use { out -> canvasBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out) }
        if (!written || !part.renameTo(target)) throw IoCodedException("Could not write image")
        return cw to ch
      } catch (e: OutOfMemoryError) {
        throw IoCodedException("Not enough memory for this image", e)
      } catch (e: IOException) {
        throw IoCodedException("Could not write image", e)
      } finally {
        decoded?.recycle()
        canvasBitmap?.recycle()
        if (part.exists()) part.delete()
      }
    }

    /** Scale the decoded [bw]x[bh] to [tw]x[th], rotate, mirror, and land inside the oriented canvas. */
    fun matrixFor(bw: Int, bh: Int, tw: Int, th: Int, orientation: Int): Matrix {
      val ops = ExifTransform.ops(orientation)
      val (cw, _) = ExifTransform.orientedSize(tw, th, orientation)
      val m = Matrix()
      m.postScale(tw.toFloat() / bw, th.toFloat() / bh)
      m.postRotate(ops.rotateDegrees.toFloat())
      when (ops.rotateDegrees) {
        90 -> m.postTranslate(th.toFloat(), 0f)
        180 -> m.postTranslate(tw.toFloat(), th.toFloat())
        270 -> m.postTranslate(0f, tw.toFloat())
      }
      if (ops.flipHorizontal) {
        m.postScale(-1f, 1f)
        m.postTranslate(cw.toFloat(), 0f)
      }
      return m
    }
  }
}
