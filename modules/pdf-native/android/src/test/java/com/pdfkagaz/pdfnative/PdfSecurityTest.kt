package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import com.tom_roush.pdfbox.text.PDFTextStripper
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

/**
 * The file-level rules of [PdfSecurity]. The Uri entry points add only the guarded descriptor
 * open (`/proc/self/fd/<n>`, which the JVM host has no equivalent of), checked on a device.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PdfSecurityTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var tempDir: File

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    tempDir = tmp.newFolder("pdfbox-tmp")
  }

  @Test
  fun inspectTellsTheFourLocks() {
    assertEquals("none", PdfSecurity.inspectFile(Fixtures.file("one-page.pdf"), tempDir))
    assertEquals("password", PdfSecurity.inspectFile(Fixtures.file("protected.pdf"), tempDir))
    assertEquals("restricted", PdfSecurity.inspectFile(Fixtures.file("owner-only.pdf"), tempDir))
    assertEquals("open", PdfSecurity.inspectFile(emptyPasswordFullPermissions(), tempDir))
  }

  @Test
  fun checkTellsOkFromWrong() {
    assertEquals("ok", PdfSecurity.checkFile(Fixtures.file("protected.pdf"), "secret", tempDir))
    assertEquals("wrong", PdfSecurity.checkFile(Fixtures.file("protected.pdf"), "x", tempDir))
  }

  /** A channel of the fixture, as a provider descriptor stands in: read in place, no copy. */
  private fun <T> viaChannel(name: String, block: (PdfSecurity.Opener) -> T): T =
    java.io.RandomAccessFile(Fixtures.file(name), "r").use { raf ->
      block { password -> PdfBoxSupport.openChannel(raf.channel, password, tempDir) }
    }

  @Test
  fun inspectAndCheckReadAChannelInPlace() {
    assertEquals("none", viaChannel("one-page.pdf") { PdfSecurity.inspectWith(it) })
    assertEquals("password", viaChannel("protected.pdf") { PdfSecurity.inspectWith(it) })
    assertEquals("restricted", viaChannel("owner-only.pdf") { PdfSecurity.inspectWith(it) })
    assertEquals("ok", viaChannel("protected.pdf") { PdfSecurity.checkWith(it, "secret") })
    assertEquals("wrong", viaChannel("protected.pdf") { PdfSecurity.checkWith(it, "x") })
    assertEquals("restricted", viaChannel("owner-only.pdf") { PdfSecurity.checkWith(it, "") })
    assertEquals("ok", viaChannel("owner-only.pdf") { PdfSecurity.checkWith(it, "owner") })
  }

  @Test
  fun aChannelOfADamagedFileIsPdfInvalid() {
    assertEquals(
      "ERR_PDF_INVALID",
      codedFailure { viaChannel("corrupted.pdf") { PdfSecurity.inspectWith(it) } }.code,
    )
  }

  @Test
  fun restrictedNeedsOwner() {
    assertEquals("restricted", PdfSecurity.checkFile(Fixtures.file("owner-only.pdf"), "", tempDir))
    assertEquals("ok", PdfSecurity.checkFile(Fixtures.file("owner-only.pdf"), "owner", tempDir))
  }

  @Test
  fun aUserPasswordWithoutChangeRightsNeedsTheOwnerPassword() {
    val file = userPasswordWithoutChangeRights()
    assertEquals("password", PdfSecurity.inspectFile(file, tempDir))
    assertEquals("restricted", PdfSecurity.checkFile(file, "user", tempDir))
    assertEquals("ok", PdfSecurity.checkFile(file, "owner", tempDir))

    val out = File(tmp.root, "open.pdf")
    assertEquals("ERR_PASSWORD_RESTRICTED", codedFailure { PdfSecurity.unlockTo(file, out, "user", tempDir) }.code)
    assertFalse(out.exists())
    PdfSecurity.unlockTo(file, out, "owner", tempDir)
    PdfBoxSupport.open(out, null, tempDir).use { doc ->
      assertFalse(doc.isEncrypted)
      assertEquals(1, doc.numberOfPages)
      assertTrue(PDFTextStripper().getText(doc).contains("Hello PDF Toolkit"))
    }
  }

  @Test
  fun unlockWritesADecryptedCopyWithItsText() {
    val out = File(tmp.root, "open.pdf")
    PdfSecurity.unlockTo(Fixtures.file("protected.pdf"), out, "secret", tempDir)
    assertFalse(File(tmp.root, "open.pdf.part").exists())
    PdfBoxSupport.open(out, null, tempDir).use { doc ->
      assertFalse(doc.isEncrypted)
      assertEquals(1, doc.numberOfPages)
      assertTrue(PDFTextStripper().getText(doc).contains("Protected"))
    }
  }

  @Test
  fun unlockOfAnEmptyPasswordFileNeedsNoPassword() {
    val out = File(tmp.root, "open.pdf")
    PdfSecurity.unlockTo(emptyPasswordFullPermissions(), out, null, tempDir)
    PdfBoxSupport.open(out, null, tempDir).use { assertFalse(it.isEncrypted) }
  }

  @Test
  fun unlockWithTheOwnerPasswordLiftsRestrictions() {
    val out = File(tmp.root, "open.pdf")
    PdfSecurity.unlockTo(Fixtures.file("owner-only.pdf"), out, "owner", tempDir)
    PdfBoxSupport.open(out, null, tempDir).use { doc ->
      assertFalse(doc.isEncrypted)
      assertTrue(PDFTextStripper().getText(doc).contains("Owner only"))
    }
  }

  @Test
  fun unlockNeverBypassesRestrictions() {
    val out = File(tmp.root, "open.pdf")
    val e = codedFailure { PdfSecurity.unlockTo(Fixtures.file("owner-only.pdf"), out, null, tempDir) }
    assertEquals("ERR_PASSWORD_RESTRICTED", e.code)
    assertFalse(out.exists())
    assertFalse(File(tmp.root, "open.pdf.part").exists())
  }

  @Test
  fun unlockMapsAMissingOrWrongPassword() {
    val out = File(tmp.root, "open.pdf")
    assertEquals("ERR_PDF_ENCRYPTED", codedFailure { PdfSecurity.unlockTo(Fixtures.file("protected.pdf"), out, null, tempDir) }.code)
    assertEquals("ERR_PASSWORD_WRONG", codedFailure { PdfSecurity.unlockTo(Fixtures.file("protected.pdf"), out, "nope", tempDir) }.code)
    assertFalse(out.exists())
  }

  @Test
  fun protectUsesAes256WithTheUsersPassword() {
    val out = File(tmp.root, "locked.pdf")
    PdfSecurity.protectTo(Fixtures.file("one-page.pdf"), out, "pässwörd", tempDir)
    assertEquals("ERR_PDF_ENCRYPTED", codedFailure { PdfBoxSupport.open(out, null, tempDir) }.code)
    assertEquals("ERR_PASSWORD_WRONG", codedFailure { PdfBoxSupport.open(out, "passwort", tempDir) }.code)
    PdfBoxSupport.open(out, "pässwörd", tempDir).use { doc ->
      val dict = doc.encryption.cosObject
      assertEquals(5, dict.getInt(COSName.V))
      assertEquals(6, dict.getInt(COSName.R))
      // The owner password is the same one: it opens with every permission.
      assertTrue(doc.currentAccessPermission.isOwnerPermission)
      assertEquals(1, doc.numberOfPages)
    }
  }

  @Test
  fun inspectOfADamagedFileIsPdfInvalid() {
    assertEquals("ERR_PDF_INVALID", codedFailure { PdfSecurity.inspectFile(Fixtures.file("corrupted.pdf"), tempDir) }.code)
  }

  @Test
  fun noErrorMessageCarriesAPassword() {
    val out = File(tmp.root, "open.pdf")
    val failures = listOf(
      codedFailure { PdfSecurity.unlockTo(Fixtures.file("protected.pdf"), out, "wrong-pw-123", tempDir) },
      codedFailure { PdfSecurity.unlockTo(Fixtures.file("owner-only.pdf"), out, "", tempDir) },
      codedFailure { PdfSecurity.unlockTo(Fixtures.file("corrupted.pdf"), out, "secret", tempDir) },
      codedFailure { PdfSecurity.protectTo(Fixtures.file("corrupted.pdf"), out, "pässwörd", tempDir) },
    )
    for (e in failures) {
      var t: Throwable? = e
      while (t != null) {
        val message = t.message.orEmpty()
        for (secret in listOf("wrong-pw-123", "secret", "pässwörd", "owner-only", "/")) {
          assertFalse(message, message.contains(secret))
        }
        t = t.cause
      }
    }
  }

  @Test
  fun codedErrorsThrownInsideTheOpenAndSaveMappingsPassThrough() {
    assertEquals(
      "ERR_PASSWORD_RESTRICTED",
      codedFailure { PdfBoxSupport.mapOpenErrors("pw") { throw PasswordRestrictedException() } }.code,
    )
    assertEquals(
      "ERR_CANCELLED",
      codedFailure { PdfBoxSupport.mapSaveErrors { throw CancelledException() } }.code,
    )
  }

  /** Encrypted, but the empty user password grants every permission. */
  private fun emptyPasswordFullPermissions(): File {
    val out = File(tmp.root, "empty-user.pdf")
    PdfBoxSupport.open(Fixtures.file("one-page.pdf"), null, tempDir).use { doc ->
      val policy = StandardProtectionPolicy("owner-pw", "", AccessPermission())
      policy.encryptionKeyLength = 128
      doc.protect(policy)
      PdfBoxSupport.saveTo(doc, out)
    }
    return out
  }

  /** Needs the user password "user", which forbids modifying, assembling and extracting. */
  private fun userPasswordWithoutChangeRights(): File {
    val out = File(tmp.root, "user-restricted.pdf")
    PdfBoxSupport.open(Fixtures.file("one-page.pdf"), null, tempDir).use { doc ->
      val access = AccessPermission().apply {
        setCanModify(false)
        setCanAssembleDocument(false)
        setCanExtractContent(false)
      }
      val policy = StandardProtectionPolicy("owner", "user", access)
      policy.encryptionKeyLength = 256
      doc.protect(policy)
      PdfBoxSupport.saveTo(doc, out)
    }
    return out
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
