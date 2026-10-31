package com.pdfkagaz.pdfnative

/** Maps a word box of the page bitmap (as seen, y down) to a placement in user space. */
object OcrGeometry {
  /**
   * Where to write [word]: its box clamped to the [widthPx] x [heightPx] bitmap, scaled to points
   * of the page as seen, then placed with [StampGeometry.placeOnPage] (so `/Rotate` and the CropBox
   * origin are honoured). Null when nothing of the box is left.
   */
  fun wordPlacement(page: PageBox, widthPx: Int, heightPx: Int, word: OcrWord): Placement? {
    if (widthPx <= 0 || heightPx <= 0) return null
    val left = word.left.coerceIn(0, widthPx)
    val right = word.right.coerceIn(0, widthPx)
    val top = word.top.coerceIn(0, heightPx)
    val bottom = word.bottom.coerceIn(0, heightPx)
    if (right <= left || bottom <= top) return null
    val visual = StampGeometry.visualSize(page)
    val sx = visual.width / widthPx
    val sy = visual.height / heightPx
    val center = StampCenter((left + right) / 2.0 * sx, (top + bottom) / 2.0 * sy)
    return StampGeometry.placeOnPage(page, center, StampSize((right - left) * sx, (bottom - top) * sy), 0.0)
  }
}
