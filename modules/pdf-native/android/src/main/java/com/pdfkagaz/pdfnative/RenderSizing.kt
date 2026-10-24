package com.pdfkagaz.pdfnative

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sqrt

/** A page bitmap's size in pixels; [reduced] when it is smaller than the asked DPI gives. */
data class RenderSize(val width: Int, val height: Int, val reduced: Boolean)

/** Pure sizing of one exported page (PDF to images); points are 1/72 inch. */
object RenderSizing {
  /** At most this many pixels in one rendered page (48 MB as ARGB_8888). */
  const val RENDER_MAX_PIXELS = 12_582_912L

  /**
   * Scale = min(dpi / 72, sqrt(RENDER_MAX_PIXELS / (w × h))). Full-size sides are rounded; a
   * reduced page's sides are floored so the cap holds. Each side is at least 1 px, and
   * width × height never exceeds [RENDER_MAX_PIXELS] (a 1 px wide strip gets a shorter height).
   */
  fun sizeFor(widthPt: Float, heightPt: Float, dpi: Int): RenderSize {
    val w = points(widthPt)
    val h = points(heightPt)
    val asked = max(dpi, 1) / 72.0
    val fit = sqrt(RENDER_MAX_PIXELS / (w * h))
    val reduced = fit < asked
    val scale = min(asked, fit)
    var width: Long
    var height: Long
    if (reduced) {
      width = floor(w * scale).toLong()
      height = floor(h * scale).toLong()
    } else {
      width = (w * scale).roundToLong()
      height = (h * scale).roundToLong()
    }
    width = width.coerceIn(1L, RENDER_MAX_PIXELS)
    height = height.coerceIn(1L, RENDER_MAX_PIXELS)
    // Rounding up (or the 1 px floor of a thin side) may pass the cap: the other side gives way.
    if (width * height > RENDER_MAX_PIXELS) {
      if (width >= height) width = max(1L, RENDER_MAX_PIXELS / height) else height = max(1L, RENDER_MAX_PIXELS / width)
    }
    return RenderSize(width.toInt(), height.toInt(), reduced)
  }

  private fun points(side: Float): Double = if (side.isNaN() || side < MIN_POINTS) MIN_POINTS.toDouble() else side.toDouble()

  /** A zero, negative or NaN page side counts as this many points. */
  private const val MIN_POINTS = 1e-3f
}
