package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RenderSizingTest {
  @Test
  fun a4At150DpiIsFullSize() {
    assertEquals(RenderSize(1240, 1754, reduced = false), RenderSizing.sizeFor(595.28f, 841.89f, 150))
  }

  @Test
  fun a4At300DpiFitsTheCap() {
    assertEquals(RenderSize(2480, 3508, reduced = false), RenderSizing.sizeFor(595.28f, 841.89f, 300))
  }

  @Test
  fun a0At300DpiIsReducedUnderTheCapKeepingItsAspect() {
    val size = RenderSizing.sizeFor(2383.94f, 3370.39f, 300)
    assertTrue(size.reduced)
    assertTrue(size.width.toLong() * size.height <= RenderSizing.RENDER_MAX_PIXELS)
    val aspect = size.width.toDouble() / size.height
    val expected = 2383.94 / 3370.39
    assertTrue(kotlin.math.abs(aspect - expected) / expected <= 0.01)
  }

  @Test
  fun aTinyPageIsAtLeastOnePixel() {
    assertEquals(RenderSize(1, 1, reduced = false), RenderSizing.sizeFor(1f, 1f, 72))
    val zero = RenderSizing.sizeFor(0f, 0f, 72)
    assertEquals(1, zero.width)
    assertEquals(1, zero.height)
  }

  @Test
  fun aVeryLongStripStaysUnderTheCap() {
    val size = RenderSizing.sizeFor(14_400f, 14_400f, 300)
    assertTrue(size.reduced)
    assertTrue(size.width.toLong() * size.height <= RenderSizing.RENDER_MAX_PIXELS)
    val strip = RenderSizing.sizeFor(1f, 200_000f, 300)
    assertTrue(strip.width >= 1)
    assertTrue(strip.width.toLong() * strip.height <= RenderSizing.RENDER_MAX_PIXELS)
  }

  @Test
  fun theCapIsTwelveMegapixels() {
    assertEquals(12_582_912L, RenderSizing.RENDER_MAX_PIXELS)
    assertFalse(RenderSizing.sizeFor(595.28f, 841.89f, 72).reduced)
  }
}
