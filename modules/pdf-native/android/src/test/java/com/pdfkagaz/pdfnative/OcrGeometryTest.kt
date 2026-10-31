package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class OcrGeometryTest {
  private val word = OcrWord("x", 100, 200, 300, 240)

  private fun check(page: PageBox, w: Int, h: Int, expected: Placement, word: OcrWord = this.word) {
    val at = OcrGeometry.wordPlacement(page, w, h, word)
    assertNotNull(at)
    at!!
    assertEquals(expected.x, at.x, 1e-6)
    assertEquals(expected.y, at.y, 1e-6)
    assertEquals(expected.width, at.width, 1e-6)
    assertEquals(expected.height, at.height, 1e-6)
    assertEquals(expected.rotate, at.rotate, 1e-6)
  }

  @Test
  fun upright() = check(PageBox(0.0, 0.0, 612.0, 792.0, 0), 1224, 1584, Placement(50.0, 672.0, 100.0, 20.0, 0.0))

  @Test
  fun rotated90() = check(PageBox(0.0, 0.0, 612.0, 792.0, 90), 1584, 1224, Placement(120.0, 50.0, 100.0, 20.0, 90.0))

  @Test
  fun rotated180() = check(PageBox(0.0, 0.0, 612.0, 792.0, 180), 1224, 1584, Placement(562.0, 120.0, 100.0, 20.0, 180.0))

  @Test
  fun rotated270() = check(PageBox(0.0, 0.0, 612.0, 792.0, 270), 1584, 1224, Placement(492.0, 742.0, 100.0, 20.0, 270.0))

  @Test
  fun cropBoxOffset() = check(PageBox(30.0, 40.0, 612.0, 792.0, 0), 1224, 1584, Placement(80.0, 712.0, 100.0, 20.0, 0.0))

  @Test
  fun emptyOrOutsideIsNull() {
    val page = PageBox(0.0, 0.0, 612.0, 792.0, 0)
    assertNull(OcrGeometry.wordPlacement(page, 1224, 1584, OcrWord("x", 300, 200, 300, 240)))
    assertNull(OcrGeometry.wordPlacement(page, 1224, 1584, OcrWord("x", 300, 200, 100, 240)))
    assertNull(OcrGeometry.wordPlacement(page, 1224, 1584, OcrWord("x", 1300, 200, 1400, 240)))
    assertNull(OcrGeometry.wordPlacement(page, 1224, 1584, OcrWord("x", 100, -50, 300, -10)))
  }

  @Test
  fun partlyOutsideIsClamped() {
    // Clamped to 1124..1224 x 200..240: 50 pt wide at x = 562.
    check(
      PageBox(0.0, 0.0, 612.0, 792.0, 0), 1224, 1584, Placement(562.0, 672.0, 50.0, 20.0, 0.0),
      OcrWord("x", 1124, 200, 1500, 240),
    )
  }
}
