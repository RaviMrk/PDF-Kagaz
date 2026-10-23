package com.pdfkagaz.pdfnative

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanImportsTest {
  @After
  fun idle() {
    assertTrue("a test left an import in flight", ScanImports.isIdle())
  }

  @Test
  fun sweepsWhenNoImportIsInFlight() {
    var swept = 0
    assertEquals(3, ScanImports.sweepIfIdle { swept++; 3 })
    assertEquals(1, swept)
  }

  @Test
  fun neverSweepsWhileAnImportIsInFlight() {
    var swept = 0
    ScanImports.tracking {
      assertFalse(ScanImports.isIdle())
      assertEquals(0, ScanImports.sweepIfIdle { swept++; 3 })
      ScanImports.tracking { assertEquals(0, ScanImports.sweepIfIdle { swept++; 3 }) }
      // Still one import in flight after the nested one ends.
      assertEquals(0, ScanImports.sweepIfIdle { swept++; 3 })
    }
    assertEquals(0, swept)
    assertEquals(3, ScanImports.sweepIfIdle { swept++; 3 })
  }

  @Test
  fun anImportThatThrowsStillEnds() {
    try {
      ScanImports.tracking { throw IllegalStateException("import failed") }
    } catch (_: IllegalStateException) {
      // expected
    }
    assertTrue(ScanImports.isIdle())
  }

  @Test
  fun trackingReturnsTheBlockResult() {
    assertEquals("pages", ScanImports.tracking { "pages" })
  }
}
