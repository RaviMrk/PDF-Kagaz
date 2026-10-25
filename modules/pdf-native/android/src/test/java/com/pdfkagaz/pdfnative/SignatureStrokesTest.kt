package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignatureStrokesTest {
  @Test
  fun emptyHasNoBounds() {
    val s = SignatureStrokes()
    assertTrue(s.isEmpty)
    assertNull(s.bounds(4f))
  }

  @Test
  fun boundsGrowByHalfTheStrokeWidth() {
    val s = SignatureStrokes()
    s.start(10f, 10f)
    s.move(60f, 30f)
    s.move(110f, 60f)
    s.end()
    assertFalse(s.isEmpty)
    val b = s.bounds(4f)!!
    assertEquals(8f, b.left, 0.001f)
    assertEquals(8f, b.top, 0.001f)
    assertEquals(112f, b.right, 0.001f)
    assertEquals(62f, b.bottom, 0.001f)
  }

  @Test
  fun cropIsPaddedAndUnscaledWhenNarrow() {
    val s = SignatureStrokes(strokeWidth = 4f)
    s.start(10f, 10f)
    s.move(110f, 60f)
    s.end()
    val crop = s.cropFor(1200, 8)
    assertEquals(0f, crop.left, 0.001f)
    assertEquals(0f, crop.top, 0.001f)
    assertEquals(1f, crop.scale, 0.0001f)
    assertEquals(120, crop.width)
    assertEquals(70, crop.height)
  }

  @Test
  fun wideDrawingIsScaledDownTo1200() {
    val s = SignatureStrokes(strokeWidth = 4f)
    s.start(100f, 100f)
    s.move(3100f, 400f)
    s.end()
    val crop = s.cropFor(1200, 8)
    assertEquals(1200, crop.width)
    assertTrue(crop.scale < 1f)
    assertTrue(crop.height in 1..1200)
  }

  @Test
  fun aTapIsADot() {
    val s = SignatureStrokes(strokeWidth = 6f)
    s.start(50f, 50f)
    s.end()
    assertFalse(s.isEmpty)
    val crop = s.cropFor(1200, 8)
    assertEquals(22, crop.width)
    assertEquals(22, crop.height)
    assertEquals(1f, crop.scale, 0.0001f)
  }

  @Test
  fun pointsCloserThanOneAndAHalfPixelsAreDropped() {
    val s = SignatureStrokes()
    s.start(10f, 10f)
    s.move(11f, 10f)
    s.move(11f, 11f)
    s.move(12f, 10f)
    s.end()
    assertEquals(2, s.strokes.single().size)
  }

  @Test
  fun clearEmpties() {
    val s = SignatureStrokes()
    s.start(1f, 1f)
    s.move(20f, 20f)
    s.end()
    assertNotNull(s.bounds(2f))
    s.clear()
    assertTrue(s.isEmpty)
    assertNull(s.bounds(2f))
  }
}
