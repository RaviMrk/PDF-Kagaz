package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OcrTextTest {
  @Test
  fun keepsWinAnsiText() {
    assertEquals("Café", OcrText.encodable("Café"))
    assertEquals("“ok”", OcrText.encodable("“ok”"))
  }

  @Test
  fun foldsToTheBaseLetterOrQuestionMark() {
    assertEquals("?ódz", OcrText.encodable("Łódź"))
    assertEquals("s", OcrText.encodable("ș"))
    assertEquals("a?b", OcrText.encodable("a😀b"))
  }

  @Test
  fun decomposedInputIsNormalised() {
    assertEquals("Café", OcrText.encodable("Café"))
  }

  @Test
  fun blankStaysBlank() {
    assertTrue(OcrText.encodable("  ").isBlank())
  }
}
