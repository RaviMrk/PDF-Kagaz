package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Drives SignatureTouch the way the view does, with pointers given as (id, x, y), index order. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SignatureTouchTest {
  private val strokes = SignatureStrokes()
  private val touch = SignatureTouch(strokes)

  private fun move(vararg pointers: Triple<Int, Float, Float>): Boolean {
    val ids = pointers.map { it.first }
    val index = touch.activeIndex { id -> ids.indexOf(id) }
    if (index < 0) return false
    val p = pointers[index]
    return touch.move(p.second, p.third)
  }

  private fun allPoints() = strokes.strokes.flatten()

  @Test
  fun oneFingerDrawsOneStroke() {
    assertEquals(SignatureTouch.Result.STARTED, touch.down(0, 10f, 10f))
    assertTrue(move(Triple(0, 20f, 20f)))
    assertEquals(SignatureTouch.Result.ENDED, touch.up())
    assertEquals(1, strokes.strokes.size)
    assertEquals(2, strokes.strokes[0].size)
    assertFalse(touch.isTracking)
  }

  @Test
  fun aSecondFingerIsIgnoredAndNeverJumpsIn() {
    touch.down(0, 10f, 10f)
    move(Triple(0, 20f, 20f))
    assertEquals(SignatureTouch.Result.IGNORED, touch.pointerDown())
    // Both down: index 0 is still the first finger, the second's position is never used.
    move(Triple(0, 30f, 30f), Triple(1, 500f, 500f))
    // The second finger is listed first in this event; the active one is still found by id.
    move(Triple(1, 510f, 510f), Triple(0, 40f, 40f))
    // The second finger lifts: the stroke goes on.
    assertEquals(SignatureTouch.Result.IGNORED, touch.pointerUp(1))
    move(Triple(0, 50f, 50f))
    assertEquals(SignatureTouch.Result.ENDED, touch.up())
    assertEquals(1, strokes.strokes.size)
    assertTrue(allPoints().all { it.x < 100f && it.y < 100f })
    assertEquals(5, strokes.strokes[0].size)
  }

  @Test
  fun liftingTheTrackedFingerEndsTheStrokeAndTheOtherDoesNotContinueIt() {
    touch.down(0, 10f, 10f)
    move(Triple(0, 20f, 20f))
    touch.pointerDown()
    move(Triple(0, 30f, 30f), Triple(1, 500f, 500f))
    assertEquals(SignatureTouch.Result.ENDED, touch.pointerUp(0))
    assertFalse(touch.isTracking)
    // The remaining finger is now index 0; nothing is added.
    assertFalse(move(Triple(1, 520f, 520f)))
    assertFalse(move(Triple(1, 540f, 540f)))
    assertEquals(SignatureTouch.Result.IGNORED, touch.up())
    assertEquals(1, strokes.strokes.size)
    assertTrue(allPoints().all { it.x < 100f && it.y < 100f })
    // The next gesture starts a fresh stroke.
    assertEquals(SignatureTouch.Result.STARTED, touch.down(3, 200f, 200f))
    assertTrue(move(Triple(3, 210f, 210f)))
    touch.up()
    assertEquals(2, strokes.strokes.size)
  }

  @Test
  fun cancelEndsTheStroke() {
    touch.down(0, 10f, 10f)
    move(Triple(0, 20f, 20f))
    assertEquals(SignatureTouch.Result.ENDED, touch.cancel())
    assertFalse(move(Triple(0, 60f, 60f)))
    assertEquals(SignatureTouch.Result.IGNORED, touch.cancel())
    assertEquals(2, strokes.strokes[0].size)
  }
}
