package com.pdfkagaz.pdfnative

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SignatureFilesTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private val filesDir = File("/data/user/0/p/files")

  @Test
  fun onlySigPngsDirectlyInSignatures() {
    assertTrue(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/signatures/sig-1-abc123.png"))
    assertFalse(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/db.sqlite"))
    assertFalse(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/signatures/x.png"))
    assertFalse(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/cache/sig-1.png"))
    assertFalse(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/signatures/sub/sig-1-abc123.png"))
    assertFalse(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/sig-1-abc123.png"))
  }

  @Test
  fun dotDotIsResolvedBeforeTheCheck() {
    val dir = tmp.newFolder("files")
    File(dir, "db.sqlite").writeText("x")
    File(dir, "signatures").mkdirs()
    val uri = Uri.fromFile(File(dir, "signatures/../db.sqlite")).toString()
    try {
      SignatureFiles.delete(dir, uri)
      fail("expected ERR_PERMISSION_DENIED")
    } catch (e: CodedException) {
      assertEquals("ERR_PERMISSION_DENIED", e.code)
    }
    assertTrue(File(dir, "db.sqlite").exists())
  }

  @Test
  fun deletesASignatureAndToleratesAMissingOne() {
    val dir = tmp.newFolder("files")
    val sig = File(dir, "signatures/sig-1-abc123.png").apply {
      parentFile!!.mkdirs()
      writeText("png")
    }
    SignatureFiles.delete(dir, Uri.fromFile(sig).toString())
    assertFalse(sig.exists())
    SignatureFiles.delete(dir, Uri.fromFile(sig).toString())
  }

  @Test
  fun refusesNonFileUris() {
    val dir = tmp.newFolder("files")
    for (uri in listOf("content://x/signatures/sig-1-abc123.png", "not a uri", "")) {
      try {
        SignatureFiles.delete(dir, uri)
        fail("expected ERR_PERMISSION_DENIED for $uri")
      } catch (e: CodedException) {
        assertEquals("ERR_PERMISSION_DENIED", e.code)
      }
    }
  }

  @Test
  fun namesAreSigEpochRand6() {
    val name = SignatureFiles.newName(1700000000000, "abc123")
    assertEquals("sig-1700000000000-abc123.png", name)
    assertTrue(SignatureFiles.isSignatureFile(filesDir, "/data/user/0/p/files/signatures/$name"))
    assertEquals(6, SignatureFiles.randomSuffix().length)
    assertTrue(Regex("^[a-z0-9]{6}$").matches(SignatureFiles.randomSuffix()))
  }

  @Test
  fun writesATransparentPngThroughAPartFile() {
    val dir = tmp.newFolder("files")
    val bitmap = Bitmap.createBitmap(20, 10, Bitmap.Config.ARGB_8888)
    bitmap.setPixel(5, 5, Color.BLACK)
    val file = SignatureFiles.writePng(dir, bitmap, 1L, "abc123")
    assertEquals(File(dir, "signatures/sig-1-abc123.png").canonicalPath, file.canonicalPath)
    assertFalse(File(dir, "signatures/.sig-1-abc123.png.part").exists())
    val read = BitmapFactory.decodeFile(file.path)
    assertEquals(20, read.width)
    assertEquals(0, Color.alpha(read.getPixel(0, 0)))
    assertEquals(255, Color.alpha(read.getPixel(5, 5)))
  }
}
