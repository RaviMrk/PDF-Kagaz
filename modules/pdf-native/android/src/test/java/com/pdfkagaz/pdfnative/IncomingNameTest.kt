package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Display names from other apps' providers are untrusted (F4). */
class IncomingNameTest {
  private fun clean(name: String) = FileNames.incomingDisplayName(name)

  @Test
  fun plainNamesPassThrough() {
    assertEquals("Invoice 2026.pdf", clean("Invoice 2026.pdf"))
    assertEquals("रिपोर्ट.pdf", clean("रिपोर्ट.pdf"))
  }

  @Test
  fun separatorsAndNulAreStripped() {
    assertEquals("etcpasswd.pdf", clean("../../etc/passwd.pdf"))
    assertEquals("ab.pdf", clean("a\\b.pdf"))
    assertEquals("ab.pdf", clean("a\u0000b.pdf"))
  }

  @Test
  fun controlCharactersAreStripped() {
    assertEquals("ab.pdf", clean("a\nb\t\r.pdf"))
    assertEquals("ab.pdf", clean("a\u0007\u001b\u007f\u0085b.pdf"))
  }

  @Test
  fun bidiControlsAreStripped() {
    // "invoice‮fdp.exe" displays as "invoiceexe.pdf".
    assertEquals("invoicefdp.exe", clean("invoice‮fdp.exe"))
    val all = "‪‫‬‭‮⁦⁧⁨⁩‎‏"
    assertEquals("a.pdf", clean("${all}a$all.pdf"))
  }

  @Test
  fun whitespaceIsTrimmedAndLeadingDotsDropped() {
    assertEquals("a.pdf", clean("  a.pdf  "))
    assertEquals("hidden.pdf", clean(".hidden.pdf"))
  }

  @Test
  fun emptyOrUnusableNamesFallBack() {
    assertEquals("document.pdf", clean(""))
    assertEquals("document.pdf", clean("   "))
    assertEquals("document.pdf", clean("/\\\u0000‮"))
    assertEquals("document.pdf", clean(".."))
  }

  @Test
  fun longNamesAreCappedAt255BytesKeepingTheExtension() {
    val capped = clean("a".repeat(400) + ".pdf")
    assertEquals(255, capped.toByteArray(Charsets.UTF_8).size)
    assertTrue(capped.endsWith(".pdf"))
    // Multi-byte characters are never cut in half.
    val hindi = clean("र".repeat(200) + ".pdf")
    assertTrue(hindi.toByteArray(Charsets.UTF_8).size <= 255)
    assertTrue(hindi.endsWith(".pdf"))
    assertEquals(hindi, String(hindi.toByteArray(Charsets.UTF_8), Charsets.UTF_8))
    val emoji = clean("📄".repeat(100) + ".pdf")
    assertTrue(emoji.toByteArray(Charsets.UTF_8).size <= 255)
    assertTrue(emoji.endsWith(".pdf"))
    assertTrue(!emoji.dropLast(4).last().isHighSurrogate())
  }
}
