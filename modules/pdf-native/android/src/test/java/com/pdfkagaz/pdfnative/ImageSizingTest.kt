package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Test

class ImageSizingTest {
  @Test
  fun sampleSizeIsTheLargestPowerOfTwoKeepingTheLongSideAtOrAboveTheTarget() {
    assertEquals(1, ImageSizing.sampleSize(4000, 3000, 2400))
    assertEquals(4, ImageSizing.sampleSize(9600, 7200, 2400))
    assertEquals(8, ImageSizing.sampleSize(20000, 1500, 2400))
    assertEquals(1, ImageSizing.sampleSize(100, 100, 2400))
  }

  @Test
  fun targetSizeKeepsAspectAndNeverUpscales() {
    assertEquals(2400 to 1800, ImageSizing.targetSize(4000, 3000, 2400))
    assertEquals(2400 to 180, ImageSizing.targetSize(20000, 1500, 2400))
    assertEquals(100 to 50, ImageSizing.targetSize(100, 50, 2400))
    assertEquals(2400 to 1, ImageSizing.targetSize(10000, 1, 2400))
    assertEquals(1800 to 2400, ImageSizing.targetSize(3000, 4000, 2400))
  }
}
