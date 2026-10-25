package com.pdfkagaz.pdfnative

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import kotlin.math.ceil

/**
 * A text watermark as a transparent PNG of one bold line, drawn by Android (any script the system
 * fonts cover, e.g. Devanagari), so the PDF engines only stamp an image.
 */
object TextStamp {
  const val MIN_HEIGHT = 64
  const val MAX_HEIGHT = 512
  const val MAX_WIDTH = 4096

  /**
   * Renders [text] in [colorArgb] [heightPx] tall (clamped [MIN_HEIGHT]..[MAX_HEIGHT]; a line wider
   * than [MAX_WIDTH] is drawn smaller) to [target] through a part file. Returns
   * `{ uri, width, height, sizeBytes }`. Blank text → ERR_INVALID_NAME.
   */
  fun render(text: String, colorArgb: Int, heightPx: Int, target: File): Map<String, Any?> {
    if (text.isBlank()) throw InvalidNameException()
    val height = heightPx.coerceIn(MIN_HEIGHT, MAX_HEIGHT)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      color = colorArgb
      textSize = height.toFloat()
    }
    // Fit the line's ascent..descent to the height, then shrink to the width cap if needed.
    paint.textSize *= height / (paint.fontMetrics.descent - paint.fontMetrics.ascent)
    val pad = height * 0.1f
    val textWidth = paint.measureText(text)
    if (textWidth + 2 * pad > MAX_WIDTH) paint.textSize *= (MAX_WIDTH - 2 * pad) / textWidth
    val width = ceil(paint.measureText(text) + 2 * pad).toInt().coerceIn(1, MAX_WIDTH)
    val metrics = paint.fontMetrics
    val baseline = (height - (metrics.descent - metrics.ascent)) / 2 - metrics.ascent
    val part = File(target.parentFile, ToolPaths.partName(target.name))
    var bitmap: Bitmap? = null
    try {
      bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      Canvas(bitmap).drawText(text, pad, baseline, paint)
      val written = FileOutputStream(part).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      if (!written || !part.renameTo(target)) throw IoCodedException()
      return mapOf("uri" to Uri.fromFile(target).toString(), "width" to width, "height" to height, "sizeBytes" to target.length())
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException()
    } catch (e: java.io.IOException) {
      throw IoCodedException()
    } finally {
      bitmap?.recycle()
      if (part.exists()) part.delete()
    }
  }
}
