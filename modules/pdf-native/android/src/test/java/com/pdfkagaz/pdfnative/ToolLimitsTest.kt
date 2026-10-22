package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolLimitsTest {
  private val max = 31_457_280L

  @Test
  fun knownSizeOverTheCapIsRefusedBeforeOpening() {
    assertTrue(ToolLimits.exceedsKnownSize(31_457_281, max))
    assertFalse(ToolLimits.exceedsKnownSize(max, max))
    // Unknown size (0) never refuses up front: the copy decides.
    assertFalse(ToolLimits.exceedsKnownSize(0, max))
  }

  @Test
  fun copiedBytesOverTheCapAbortTheCopy() {
    assertTrue(ToolLimits.exceedsCopied(31_457_281, max))
    assertFalse(ToolLimits.exceedsCopied(max, max))
  }
}
