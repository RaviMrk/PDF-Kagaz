package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JobNoticeRulesTest {
  @Test
  fun percentRoundsAndClamps() {
    assertEquals(56, JobNoticeRules.percentOf(0.555))
    assertEquals(0, JobNoticeRules.percentOf(Double.NaN))
    assertEquals(0, JobNoticeRules.percentOf(-0.2))
    assertEquals(100, JobNoticeRules.percentOf(1.7))
  }

  @Test
  fun firstUpdateAlwaysShows() {
    assertTrue(JobNoticeRules.shouldUpdate(null, 0, 0, 0))
  }

  @Test
  fun laterUpdatesNeedANewPercentAndHalfASecond() {
    assertFalse(JobNoticeRules.shouldUpdate(1000, 1400, 10, 11))
    assertTrue(JobNoticeRules.shouldUpdate(1000, 1500, 10, 11))
    assertFalse(JobNoticeRules.shouldUpdate(1000, 5000, 11, 11))
  }

  @Test
  fun completeAlwaysShows() {
    assertTrue(JobNoticeRules.shouldUpdate(1000, 1100, 99, 100))
  }

  @Test
  fun deepLinkOpensTheResultOfAValidJobOnly() {
    assertEquals("pdftoolkit://result?jobId=lq2-abc123", JobNoticeRules.resultDeepLink("lq2-abc123"))
    assertEquals("pdftoolkit://home", JobNoticeRules.resultDeepLink("../x"))
    assertEquals("pdftoolkit://home", JobNoticeRules.resultDeepLink(""))
  }
}
