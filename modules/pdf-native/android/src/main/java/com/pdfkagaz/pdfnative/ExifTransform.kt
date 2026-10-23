package com.pdfkagaz.pdfnative

/**
 * Pure EXIF orientation table. [Ops] are applied as: rotate clockwise by [Ops.rotateDegrees] first,
 * then mirror the result horizontally when [Ops.flipHorizontal]. (Orientation 5 is a transpose,
 * 7 a transverse; the table below is correct for this order.)
 */
object ExifTransform {
  data class Ops(val rotateDegrees: Int, val flipHorizontal: Boolean)

  fun ops(orientation: Int): Ops = when (orientation) {
    2 -> Ops(0, true)
    3 -> Ops(180, false)
    4 -> Ops(180, true)
    5 -> Ops(90, true)
    6 -> Ops(90, false)
    7 -> Ops(270, true)
    8 -> Ops(270, false)
    else -> Ops(0, false)
  }

  /** Width and height after orientation: swapped for the quarter-turn orientations 5–8. */
  fun orientedSize(width: Int, height: Int, orientation: Int): Pair<Int, Int> =
    if (ops(orientation).rotateDegrees % 180 != 0) height to width else width to height
}
