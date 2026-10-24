package com.pdfkagaz.pdfnative

import expo.modules.kotlin.exception.CodedException
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class CompressLevelsTest {
  @Test
  fun levelsHaveThePlanValues() {
    assertEquals(CompressLevels.Level(2400, 80, false), CompressLevels.of("low"))
    assertEquals(CompressLevels.Level(1600, 65, true), CompressLevels.of("medium"))
    assertEquals(CompressLevels.Level(1024, 50, true), CompressLevels.of("high"))
  }

  @Test
  fun unknownLevelIsInvalid() {
    try {
      CompressLevels.of("ultra")
      fail("expected ERR_INVALID_NAME")
    } catch (e: CodedException) {
      assertEquals("ERR_INVALID_NAME", e.code)
    }
  }

  @Test
  fun targetSizeKeepsAspectAndNeverUpscales() {
    assertEquals(1600 to 1200, CompressLevels.targetSize(2400, 1800, 1600))
    assertEquals(800 to 600, CompressLevels.targetSize(800, 600, 1600))
    assertEquals(1200 to 1600, CompressLevels.targetSize(1800, 2400, 1600))
    assertEquals(1600 to 1, CompressLevels.targetSize(9000, 2, 1600))
  }

  @Test
  fun subsamplingIsTheLargestPowerOfTwoStillAtLeastTheTarget() {
    assertEquals(2, CompressLevels.subsamplingFor(4800, 3600, 1600))
    assertEquals(1, CompressLevels.subsamplingFor(2400, 1800, 1600))
    assertEquals(1, CompressLevels.subsamplingFor(800, 600, 1600))
    assertEquals(4, CompressLevels.subsamplingFor(3600, 6400, 1600))
    assertEquals(8, CompressLevels.subsamplingFor(8192, 100, 1024))
  }

  @Test
  fun decodeSubsamplingAlsoKeepsTheDecodedBitmapUnderThePixelCap() {
    val cap = 12_582_912L
    // Within the cap: the plain power-of-2 choice.
    assertEquals(2, CompressLevels.decodeSubsampling(4800, 3600, 1600, cap))
    assertEquals(1, CompressLevels.decodeSubsampling(2400, 1800, 2400, cap))
    // 4700² decodes to 22 MP at 1: sampled once more.
    assertEquals(2, CompressLevels.decodeSubsampling(4700, 4700, 2400, cap))
    assertEquals(16, CompressLevels.decodeSubsampling(20000, 20000, 1024, cap))
  }
}
