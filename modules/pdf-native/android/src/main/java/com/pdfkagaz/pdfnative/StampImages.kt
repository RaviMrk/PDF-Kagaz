package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/** Image watermarks: an image session source prepared as a PNG that keeps its transparency. */
class StampImages(private val context: Context) {
  /**
   * Writes source [sourceIndex] of [sessionId] as `<job>/stamp-image-<sourceIndex>.png`: alpha
   * kept, EXIF-upright, long side at most [maxLongSidePx] (clamped [MIN_LONG_SIDE]..[MAX_LONG_SIDE]).
   * Returns `{ uri, width, height, sizeBytes }`.
   */
  suspend fun prepare(sessionId: String, sourceIndex: Int, jobId: String, maxLongSidePx: Int): Map<String, Any?> =
    RenderSupport.mapErrors {
      withContext(Dispatchers.IO) {
        if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
        val source = ImageFiles.sourceFile(context, sessionId, sourceIndex)
        val dir = File(File(context.cacheDir, ToolPaths.DIR), jobId)
        if (!dir.isDirectory && !dir.mkdirs()) throw IoCodedException()
        val target = File(dir, "stamp-image-$sourceIndex.png")
        val maxLongSide = maxLongSidePx.coerceIn(MIN_LONG_SIDE, MAX_LONG_SIDE)
        val part = File(dir, ToolPaths.partName(target.name))
        var decoded: Bitmap? = null
        var canvasBitmap: Bitmap? = null
        try {
          val bounds = ImageFiles.decodeBounds(source) ?: throw ImageInvalidException()
          val orientation = ImageFiles.orientationOf(source)
          val (tw, th) = ImageSizing.targetSize(bounds.first, bounds.second, maxLongSide)
          val (cw, ch) = ExifTransform.orientedSize(tw, th, orientation)
          ensureActive()
          val options = BitmapFactory.Options().apply {
            inSampleSize = ImageSizing.sampleSize(bounds.first, bounds.second, maxLongSide)
            inPreferredConfig = Bitmap.Config.ARGB_8888
          }
          decoded = BitmapFactory.decodeFile(source.path, options) ?: throw ImageInvalidException()
          canvasBitmap = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888)
          Canvas(canvasBitmap).drawBitmap(
            decoded,
            ImageFiles.matrixFor(decoded.width, decoded.height, tw, th, orientation),
            Paint(Paint.FILTER_BITMAP_FLAG),
          )
          decoded.recycle()
          decoded = null
          ensureActive()
          val written = FileOutputStream(part).use { canvasBitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
          if (!written || !part.renameTo(target)) throw IoCodedException()
          mapOf("uri" to Uri.fromFile(target).toString(), "width" to cw, "height" to ch, "sizeBytes" to target.length())
        } catch (e: OutOfMemoryError) {
          throw OutOfMemoryCodedException()
        } catch (e: IOException) {
          throw IoCodedException()
        } finally {
          decoded?.recycle()
          canvasBitmap?.recycle()
          if (part.exists()) part.delete()
        }
      }
    }

  companion object {
    const val MIN_LONG_SIDE = 256
    const val MAX_LONG_SIDE = 2048
  }
}
