package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PageTextTest {
  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
  }

  @Test
  fun scannedPagesHaveNoTextAndTextPageDoes() {
    PDDocument.load(Fixtures.file("scanned-text.pdf")).use { doc ->
      assertFalse(PageText.hasText(doc, 0))
      assertFalse(PageText.hasText(doc, 1))
      assertTrue(PageText.hasText(doc, 2))
    }
  }

  @Test
  fun shortTextStaysBelowTheThreshold() {
    // "Hello PDF Toolkit" is 15 characters, under MIN_TEXT_CHARS (20).
    PDDocument.load(Fixtures.file("one-page.pdf")).use { doc -> assertFalse(PageText.hasText(doc, 0)) }
  }

  @Test
  fun aPageWhoseTextCannotBeStrippedCountsAsNoText() {
    assertFalse(PageText.hasText { throw java.io.IOException("broken content stream") })
    assertFalse(PageText.hasText { throw IllegalStateException("broken font") })
    assertTrue(PageText.hasText { "x".repeat(PageText.MIN_TEXT_CHARS) })
    try {
      PageText.hasText { throw OutOfMemoryError() }
      fail("expected ERR_OUT_OF_MEMORY")
    } catch (e: OutOfMemoryCodedException) {
      // expected
    }
  }
}
