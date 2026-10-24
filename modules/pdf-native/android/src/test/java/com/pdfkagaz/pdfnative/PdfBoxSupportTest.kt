package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import expo.modules.kotlin.exception.CodedException
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PdfBoxSupportTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var tempDir: File

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    tempDir = tmp.newFolder("pdfbox-tmp")
  }

  @Test
  fun opensAPlainPdf() {
    PdfBoxSupport.open(Fixtures.file("one-page.pdf"), null, tempDir).use { doc ->
      assertEquals(1, doc.numberOfPages)
      assertFalse(doc.isEncrypted)
    }
  }

  @Test
  fun encryptedWithoutPasswordIsPdfEncrypted() {
    val e = codedFailure { PdfBoxSupport.open(Fixtures.file("protected.pdf"), null, tempDir) }
    assertEquals("ERR_PDF_ENCRYPTED", e.code)
  }

  @Test
  fun wrongPasswordIsPasswordWrong() {
    val e = codedFailure { PdfBoxSupport.open(Fixtures.file("protected.pdf"), "nope", tempDir) }
    assertEquals("ERR_PASSWORD_WRONG", e.code)
  }

  @Test
  fun rightPasswordOpensTheEncryptedPdf() {
    PdfBoxSupport.open(Fixtures.file("protected.pdf"), "secret", tempDir).use { doc ->
      assertTrue(doc.isEncrypted)
      assertEquals(1, doc.numberOfPages)
    }
  }

  @Test
  fun ownerOnlyOpensWithoutPasswordButForbidsChanges() {
    PdfBoxSupport.open(Fixtures.file("owner-only.pdf"), null, tempDir).use { doc ->
      assertTrue(doc.isEncrypted)
      assertFalse(doc.currentAccessPermission.isOwnerPermission)
      assertFalse(doc.currentAccessPermission.canModify())
    }
  }

  @Test
  fun damagedPdfIsPdfInvalid() {
    val e = codedFailure { PdfBoxSupport.open(Fixtures.file("corrupted.pdf"), null, tempDir) }
    assertEquals("ERR_PDF_INVALID", e.code)
  }

  @Test
  fun aes256RoundTripWorksWithoutBcpkixOrBcutil() {
    val out = File(tmp.root, "out.pdf")
    PdfBoxSupport.open(Fixtures.file("one-page.pdf"), null, tempDir).use { doc ->
      val policy = StandardProtectionPolicy("pw", "pw", AccessPermission())
      policy.encryptionKeyLength = 256
      doc.protect(policy)
      PdfBoxSupport.saveTo(doc, out)
    }
    assertTrue(out.isFile)
    assertFalse(File(tmp.root, "out.pdf.part").exists())

    assertEquals("ERR_PDF_ENCRYPTED", codedFailure { PdfBoxSupport.open(out, null, tempDir) }.code)
    PdfBoxSupport.open(out, "pw", tempDir).use { doc ->
      assertTrue(doc.isEncrypted)
      assertEquals(5, doc.encryption.version)
      assertEquals(256, doc.encryption.length)
      assertEquals(1, doc.numberOfPages)
    }
  }

  @Test
  fun saveToReplacesTheTargetThroughAPartFile() {
    val out = File(tmp.root, "same.pdf").apply { writeText("old") }
    PdfBoxSupport.open(Fixtures.file("mixed-sizes.pdf"), null, tempDir).use { doc -> PdfBoxSupport.saveTo(doc, out) }
    assertFalse(File(tmp.root, "same.pdf.part").exists())
    PDDocument.load(out).use { assertEquals(3, it.numberOfPages) }
  }

  @Test
  fun errorMessagesCarryNoFileNameOrPath() {
    val failures = listOf(
      codedFailure { PdfBoxSupport.open(Fixtures.file("protected.pdf"), null, tempDir) },
      codedFailure { PdfBoxSupport.open(Fixtures.file("protected.pdf"), "nope", tempDir) },
      codedFailure { PdfBoxSupport.open(Fixtures.file("corrupted.pdf"), null, tempDir) },
      codedFailure { PdfBoxSupport.open(File(tmp.root, "one-page.pdf"), null, tempDir) },
    )
    for (e in failures) {
      val message = e.message.orEmpty()
      assertFalse(message, message.contains("one-page"))
      assertFalse(message, message.contains("/"))
    }
  }

  private fun codedFailure(block: () -> Unit): CodedException {
    try {
      block()
    } catch (e: CodedException) {
      return e
    }
    fail("Expected a CodedException")
    throw AssertionError()
  }
}
