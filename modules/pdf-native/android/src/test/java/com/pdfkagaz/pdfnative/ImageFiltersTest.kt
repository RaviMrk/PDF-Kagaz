package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageFiltersTest {
  private fun near(expected: Int, actual: Int) = assertTrue("expected $expected±1, was $actual", kotlin.math.abs(expected - actual) <= 1)

  @Test
  fun colourNeedsNoMatrix() {
    assertNull(ImageFilters.matrix(ImageFilters.COLOUR))
  }

  @Test
  fun greyscaleUsesLuminanceWeights() {
    val m = ImageFilters.matrix(ImageFilters.GREYSCALE)!!
    assertEquals(20, m.size)
    val (r, g, b) = ImageFilters.applyTo(m, 255, 0, 0)
    near(76, r)
    near(76, g)
    near(76, b)
    near(255, ImageFilters.applyTo(m, 255, 255, 255).first)
  }

  @Test
  fun blackAndWhiteThresholdsAtMidGrey() {
    val m = ImageFilters.matrix(ImageFilters.BW)!!
    assertEquals(Triple(255, 255, 255), ImageFilters.applyTo(m, 200, 200, 200))
    assertEquals(Triple(0, 0, 0), ImageFilters.applyTo(m, 60, 60, 60))
    assertEquals(Triple(0, 0, 0), ImageFilters.applyTo(m, 255, 0, 0))
  }

  @Test
  fun onlyKnownFiltersAreValid() {
    assertTrue(ImageFilters.isValid("colour"))
    assertTrue(ImageFilters.isValid("greyscale"))
    assertTrue(ImageFilters.isValid("bw"))
    assertFalse(ImageFilters.isValid("sepia"))
    assertNull(ImageFilters.matrix("sepia"))
    assertNotNull(ImageFilters.matrix("bw"))
  }
}
