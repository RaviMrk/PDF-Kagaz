package com.pdfkagaz.pdfnative

import com.pdfkagaz.pdfnative.SaveTargetPolicy.Decision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SaveTargetPolicyTest {
  @Test
  fun writesOnlyANewEmptyTargetThatIsNotTheSource() {
    assertEquals(Decision.WRITE, SaveTargetPolicy.decide(targetSize = 0L, sameAsSource = false))
  }

  @Test
  fun refusesATargetWithContent() {
    assertEquals(Decision.REFUSE, SaveTargetPolicy.decide(targetSize = 1L, sameAsSource = false))
    assertEquals(Decision.REFUSE, SaveTargetPolicy.decide(targetSize = 5_000_000L, sameAsSource = false))
  }

  @Test
  fun refusesATargetOfUnknownSize() {
    assertEquals(Decision.REFUSE, SaveTargetPolicy.decide(targetSize = null, sameAsSource = false))
  }

  @Test
  fun refusesTheSourceItselfEvenWhenEmpty() {
    assertEquals(Decision.REFUSE, SaveTargetPolicy.decide(targetSize = 0L, sameAsSource = true))
  }

  private val provider = "com.android.externalstorage.documents"

  @Test
  fun sameDocumentByUriDocumentIdOrCanonicalPath() {
    val doc = DocRef("content://$provider/document/primary%3Aa.pdf", provider, "primary:a.pdf", null)
    assertTrue(SaveTargetPolicy.sameDocument(doc, doc.copy()))
    // Same document reached through a tree URI.
    val viaTree = DocRef("content://$provider/tree/primary%3A/document/primary%3Aa.pdf", provider.uppercase(), "primary:a.pdf", null)
    assertTrue(SaveTargetPolicy.sameDocument(doc, viaTree))
    val file = DocRef("file:///storage/emulated/0/a.pdf", null, null, "/storage/emulated/0/a.pdf")
    assertTrue(SaveTargetPolicy.sameDocument(file, DocRef("file:///sdcard/a.pdf", null, null, "/storage/emulated/0/a.pdf")))
  }

  @Test
  fun differentDocumentsAreNotTheSame() {
    val a = DocRef("content://$provider/document/primary%3Aa.pdf", provider, "primary:a.pdf", null)
    assertFalse(SaveTargetPolicy.sameDocument(a, DocRef("content://$provider/document/primary%3Ab.pdf", provider, "primary:b.pdf", null)))
    // Same id on another provider is another document.
    assertFalse(SaveTargetPolicy.sameDocument(a, DocRef("content://other/document/primary%3Aa.pdf", "other", "primary:a.pdf", null)))
    val workspace = DocRef("file:///data/cache/tools/j/out.pdf", null, null, "/data/cache/tools/j/out.pdf")
    assertFalse(SaveTargetPolicy.sameDocument(workspace, a))
    // Unknown ids / paths never match each other.
    assertFalse(SaveTargetPolicy.sameDocument(DocRef("content://x/1", "x", null, null), DocRef("content://x/2", "x", null, null)))
  }

  @Test
  fun opensTruncatingFirstThenPlainWrite() {
    assertEquals(listOf("wt", "w"), SaveTargetPolicy.WRITE_MODES)
  }

  @Test
  fun onlyAnUnsupportedModeFallsBackToTheNextMode() {
    assertTrue(SaveTargetPolicy.isModeUnsupported(IllegalArgumentException("Bad mode")))
    assertTrue(SaveTargetPolicy.isModeUnsupported(UnsupportedOperationException()))
    assertFalse(SaveTargetPolicy.isModeUnsupported(java.io.FileNotFoundException()))
    assertFalse(SaveTargetPolicy.isModeUnsupported(SecurityException()))
    assertFalse(SaveTargetPolicy.isModeUnsupported(java.io.IOException()))
  }
}
