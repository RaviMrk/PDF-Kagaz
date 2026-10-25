package com.pdfkagaz.pdfnative

import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.min

/** The trimmed region of the pad to export: view-pixel origin, scale, and output size in pixels. */
data class Crop(val left: Float, val top: Float, val scale: Float, val width: Int, val height: Int)

/**
 * The points of a drawn signature, in view pixels (pure: no drawing). A point closer than
 * [MIN_DISTANCE] to the previous one is dropped; a tap with no move is a one-point stroke (a dot).
 */
class SignatureStrokes(var strokeWidth: Float = 1f) {
  data class Point(val x: Float, val y: Float)

  private val all = mutableListOf<MutableList<Point>>()
  private var current: MutableList<Point>? = null

  /** Every stroke, oldest first; each has at least one point. */
  val strokes: List<List<Point>>
    get() = all

  val isEmpty: Boolean
    get() = all.isEmpty()

  fun start(x: Float, y: Float) {
    val stroke = mutableListOf(Point(x, y))
    all.add(stroke)
    current = stroke
  }

  /** Adds a point to the stroke in progress; false when it was dropped (or no stroke is open). */
  fun move(x: Float, y: Float): Boolean {
    val stroke = current ?: return false
    val last = stroke.last()
    if (hypot(x - last.x, y - last.y) < MIN_DISTANCE) return false
    stroke.add(Point(x, y))
    return true
  }

  fun end() {
    current = null
  }

  fun clear() {
    all.clear()
    current = null
  }

  /** The ink's bounding box (points grown by half of [strokeWidth]); null when empty. */
  fun bounds(strokeWidth: Float): RectF? {
    if (all.isEmpty()) return null
    var left = Float.MAX_VALUE
    var top = Float.MAX_VALUE
    var right = -Float.MAX_VALUE
    var bottom = -Float.MAX_VALUE
    for (stroke in all) for (p in stroke) {
      if (p.x < left) left = p.x
      if (p.y < top) top = p.y
      if (p.x > right) right = p.x
      if (p.y > bottom) bottom = p.y
    }
    val half = strokeWidth / 2
    return RectF(left - half, top - half, right + half, bottom + half)
  }

  /**
   * The ink's bounds plus [paddingPx] on each side, scaled down (never up) so the exported image is
   * at most [maxWidthPx] wide. An empty drawing gives a 1 × 1 crop.
   */
  fun cropFor(maxWidthPx: Int, paddingPx: Int): Crop {
    val b = bounds(strokeWidth) ?: return Crop(0f, 0f, 1f, 1, 1)
    val left = b.left - paddingPx
    val top = b.top - paddingPx
    val w = b.width() + 2 * paddingPx
    val h = b.height() + 2 * paddingPx
    val scale = min(1f, maxWidthPx / w)
    val width = ceil(w * scale - EPSILON).toInt().coerceIn(1, maxWidthPx)
    val height = ceil(h * scale - EPSILON).toInt().coerceAtLeast(1)
    return Crop(left, top, scale, width, height)
  }

  companion object {
    const val MIN_DISTANCE = 1.5f
    const val PADDING_PX = 8
    const val MAX_WIDTH_PX = 1200
    private const val EPSILON = 0.001f
  }
}
