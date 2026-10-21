package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IncomingPdfTest {
  private val send = "android.intent.action.SEND"
  private val view = "android.intent.action.VIEW"

  @Test
  fun sendWithPdfTypeAndStreamGivesTheStream() {
    assertEquals("content://a/1", IncomingPdf.streamUriOf(send, "application/pdf", "content://a/1"))
  }

  @Test
  fun viewIsNotAStream() {
    assertNull(IncomingPdf.streamUriOf(view, "application/pdf", "content://a/1"))
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

  @Test
  fun launchUriTakesASharedStream() {
    assertEquals("content://a/1", IncomingPdf.launchUriOf(send, "application/pdf", "content://a/1", null))
  }

  @Test
  fun launchUriTakesAViewedContentOrFileUri() {
    assertEquals("content://a/2", IncomingPdf.launchUriOf(view, "application/pdf", null, "content://a/2"))
    assertEquals("file:///sdcard/a.pdf", IncomingPdf.launchUriOf(view, null, null, "file:///sdcard/a.pdf"))
    assertEquals("CONTENT://a/3", IncomingPdf.launchUriOf(view, "application/pdf", null, "CONTENT://a/3"))
  }

  @Test
  fun launchUriLeavesAppLinksAndOtherIntentsAlone() {
    assertNull(IncomingPdf.launchUriOf(view, null, null, "pdftoolkit://files"))
    assertNull(IncomingPdf.launchUriOf(view, null, null, "https://example.com/a.pdf"))
    assertNull(IncomingPdf.launchUriOf(view, "application/pdf", null, null))
    assertNull(IncomingPdf.launchUriOf("android.intent.action.MAIN", null, null, "content://a/1"))
    assertNull(IncomingPdf.launchUriOf(send, "text/plain", "content://a/1", null))
  }
}
