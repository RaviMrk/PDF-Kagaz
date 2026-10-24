package com.pdfkagaz.pdfnative

import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StampImagesTest {
  private val context = RuntimeEnvironment.getApplication()
  private val session = "img-stamp-test"
  private val job = "job-stamp-test"

  private fun prepared(fixture: String, maxLongSide: Int): Pair<Map<String, Any?>, android.graphics.Bitmap> = runBlocking {
    ImageFiles(context).importStream(session, 0, 52_428_800L) { FileInputStream(Fixtures.file(fixture)) }
    val result = StampImages(context).prepare(session, 0, job, maxLongSide)
    val file = File(Uri.parse(result["uri"] as String).path!!)
    assertTrue(file.name.endsWith(".png"))
    assertEquals(file.length(), result["sizeBytes"])
    result to BitmapFactory.decodeFile(file.path)
  }

  @Test
  fun keepsAlpha() {
    val (result, bitmap) = prepared("images/alpha-200x100.png", 2048)
    assertEquals(200, result["width"])
    assertEquals(100, result["height"])
    assertTrue(bitmap.hasAlpha())
    val alphas = (0 until 200 step 10).flatMap { x -> (0 until 100 step 10).map { y -> Color.alpha(bitmap.getPixel(x, y)) } }
    assertTrue(alphas.any { it < 255 })
  }

  @Test
  fun turnsExifUprightAndBoundsTheLongSide() {
    val (result, bitmap) = prepared("images/exif-rotate-90.jpg", 256)
    assertEquals(192, result["width"])
    assertEquals(256, result["height"])
    assertEquals(192, bitmap.width)
    assertEquals(256, bitmap.height)
  }

  @Test
  fun clampsTheLongSide() {
    val (result, _) = prepared("images/landscape-400x300.jpg", 100)
    assertEquals(256, result["width"])
    assertEquals(192, result["height"])
  }
}
