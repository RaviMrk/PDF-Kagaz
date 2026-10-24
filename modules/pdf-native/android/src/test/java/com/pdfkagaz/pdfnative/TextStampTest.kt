package com.pdfkagaz.pdfnative

import android.graphics.BitmapFactory
import android.graphics.Color
import expo.modules.kotlin.exception.CodedException
import java.io.File
import org.junit.Assert.assertEquals
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
class TextStampTest {
  @get:Rule
  val tmp = TemporaryFolder()

  @Test
  fun rendersOneTransparentLine() {
    val target = File(tmp.root, "stamp-text.png")
    val result = TextStamp.render("CONFIDENTIAL", 0xff808080.toInt(), 100, target)
    assertEquals("file://${target.path}", result["uri"])
    assertEquals(target.length(), result["sizeBytes"])
    val bitmap = BitmapFactory.decodeFile(target.path)
    assertEquals(100, bitmap.height)
    assertEquals(result["width"], bitmap.width)
    assertEquals(result["height"], bitmap.height)
    assertTrue(bitmap.width > 300)
    assertTrue(bitmap.hasAlpha())
    assertEquals(0, Color.alpha(bitmap.getPixel(0, 0)))
    var inked = 0
    for (x in 0 until bitmap.width step 2) for (y in 0 until bitmap.height step 2) {
      val p = bitmap.getPixel(x, y)
      if (Color.alpha(p) == 255) {
        inked++
        assertEquals(0x80, Color.red(p))
      }
    }
    assertTrue(inked > 50)
  }

  @Test
  fun clampsTheHeight() {
    assertEquals(64, TextStamp.render("A", Color.RED, 10, File(tmp.root, "a.png"))["height"])
    assertEquals(512, TextStamp.render("A", Color.RED, 9999, File(tmp.root, "b.png"))["height"])
  }

  @Test
  fun rendersAnyScript() {
    val result = TextStamp.render("गोपनीय", Color.BLUE, 128, File(tmp.root, "mr.png"))
    assertEquals(128, result["height"])
    assertTrue((result["width"] as Int) > 0)
  }

  @Test
  fun refusesBlankText() {
    try {
      TextStamp.render("  ", Color.RED, 128, File(tmp.root, "c.png"))
      fail("Expected ERR_INVALID_NAME")
    } catch (e: CodedException) {
      assertEquals("ERR_INVALID_NAME", e.code)
    }
  }
}
