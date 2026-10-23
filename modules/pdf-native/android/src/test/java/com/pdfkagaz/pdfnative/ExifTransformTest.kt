package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Test

class ExifTransformTest {
  @Test
  fun allOrientationsMapToFlipThenRotate() {
    val expected = mapOf(
      1 to ExifTransform.Ops(0, false),
      2 to ExifTransform.Ops(0, true),
      3 to ExifTransform.Ops(180, false),
      4 to ExifTransform.Ops(180, true),
      5 to ExifTransform.Ops(90, true),
      6 to ExifTransform.Ops(90, false),
      7 to ExifTransform.Ops(270, true),
      8 to ExifTransform.Ops(270, false),
    )
    for ((orientation, ops) in expected) assertEquals("orientation $orientation", ops, ExifTransform.ops(orientation))
  }

  @Test
  fun unknownOrientationsAreLeftAlone() {
    assertEquals(ExifTransform.Ops(0, false), ExifTransform.ops(0))
    assertEquals(ExifTransform.Ops(0, false), ExifTransform.ops(9))
    assertEquals(ExifTransform.Ops(0, false), ExifTransform.ops(-1))
  }

  @Test
  fun quarterTurnsSwapTheSize() {
    assertEquals(300 to 400, ExifTransform.orientedSize(400, 300, 6))
    assertEquals(300 to 400, ExifTransform.orientedSize(400, 300, 5))
    assertEquals(300 to 400, ExifTransform.orientedSize(400, 300, 8))
    assertEquals(300 to 400, ExifTransform.orientedSize(400, 300, 7))
    assertEquals(400 to 300, ExifTransform.orientedSize(400, 300, 3))
    assertEquals(400 to 300, ExifTransform.orientedSize(400, 300, 1))
    assertEquals(400 to 300, ExifTransform.orientedSize(400, 300, 0))
  }

  /** Where the top-left pixel of a w x h image lands, rotating clockwise first and then mirroring. */
  private fun topLeftLandsAt(w: Int, h: Int, orientation: Int): Pair<Int, Int> {
    val ops = ExifTransform.ops(orientation)
    val (cw, ch) = ExifTransform.orientedSize(w, h, orientation)
    val (x, y) = when (ops.rotateDegrees) {
      90 -> (h - 1) to 0
      180 -> (w - 1) to (h - 1)
      270 -> 0 to (w - 1)
      else -> 0 to 0
    }
    return (if (ops.flipHorizontal) cw - 1 - x else x) to y.coerceIn(0, ch - 1)
  }

  @Test
  fun transposeAndTransverseLandWhereTheExifSpecSaysTheyDo() {
    // 5 (transpose): top-left stays top-left. 7 (transverse): top-left goes to the bottom-right.
    assertEquals(0 to 0, topLeftLandsAt(400, 300, 5))
    assertEquals(299 to 399, topLeftLandsAt(400, 300, 7))
    // 6 (rotate 90 cw): top-left goes to the top-right. 8: to the bottom-left.
    assertEquals(299 to 0, topLeftLandsAt(400, 300, 6))
    assertEquals(0 to 399, topLeftLandsAt(400, 300, 8))
  }
}
