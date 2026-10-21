package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IncomingPdfTest {
  private val send = "android.intent.action.SEND"

  @Test
  fun sendWithPdfTypeAndStreamGivesTheStream() {
    assertEquals("content://a/1", IncomingPdf.streamUriOf(send, "application/pdf", "content://a/1"))
  }

  @Test
  fun viewIsLeftToLinking() {
    assertNull(IncomingPdf.streamUriOf("android.intent.action.VIEW", "application/pdf", "content://a/1"))
  }

  @Test
  fun sendWithAnotherTypeIsIgnored() {
    assertNull(IncomingPdf.streamUriOf(send, "text/plain", "content://a/1"))
  }

  @Test
  fun sendWithoutAStreamIsIgnored() {
    assertNull(IncomingPdf.streamUriOf(send, "application/pdf", null))
    assertNull(IncomingPdf.streamUriOf(send, "application/pdf", ""))
  }
}
