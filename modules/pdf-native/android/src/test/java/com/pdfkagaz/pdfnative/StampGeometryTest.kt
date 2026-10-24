package com.pdfkagaz.pdfnative

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Review Focus 2: the same `__fixtures__/stamp-vectors.json` as stampGeometry.test.ts (org.json needs Robolectric). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StampGeometryTest {
  private fun size(o: JSONObject) = StampSize(o.getDouble("width"), o.getDouble("height"))

  private fun run(fn: String, a: JSONObject): Map<String, Double> = when (fn) {
    "rotatedBounds" -> StampGeometry.rotatedBounds(a.getDouble("width"), a.getDouble("height"), a.getDouble("angleDeg"))
      .let { mapOf("width" to it.width, "height" to it.height) }
    "positionCenter" -> StampGeometry.positionCenter(a.getString("position"), size(a.getJSONObject("visual")), size(a.getJSONObject("box")), a.getDouble("marginPt"))
      .let { mapOf("cx" to it.cx, "cy" to it.cy) }
    "placeOnPage" -> {
      val p = a.getJSONObject("page")
      val c = a.getJSONObject("center")
      StampGeometry.placeOnPage(
        PageBox(p.getDouble("x"), p.getDouble("y"), p.getDouble("width"), p.getDouble("height"), p.getInt("rotation")),
        StampCenter(c.getDouble("cx"), c.getDouble("cy")),
        size(a.getJSONObject("box")),
        a.getDouble("angleDeg"),
      ).let { mapOf("x" to it.x, "y" to it.y, "width" to it.width, "height" to it.height, "rotate" to it.rotate) }
    }
    else -> error("unknown fn $fn")
  }

  @Test
  fun everySharedVectorMatches() {
    val vectors = JSONArray(Fixtures.file("stamp-vectors.json").readText())
    assertTrue(vectors.length() >= 16)
    for (i in 0 until vectors.length()) {
      val v = vectors.getJSONObject(i)
      val actual = run(v.getString("fn"), v.getJSONObject("args"))
      val expected = v.getJSONObject("expected")
      for (key in expected.keys()) {
        val got = actual[key] ?: error("${v.getString("name")}: no $key")
        assertEquals("${v.getString("name")} $key", expected.getDouble(key), got, 0.01)
      }
    }
  }

  @Test
  fun visualSizeSwapsForQuarterTurns() {
    for (r in listOf(0, 180)) assertEquals(StampSize(600.0, 800.0), StampGeometry.visualSize(PageBox(20.0, 30.0, 600.0, 800.0, r)))
    for (r in listOf(90, 270)) assertEquals(StampSize(800.0, 600.0), StampGeometry.visualSize(PageBox(20.0, 30.0, 600.0, 800.0, r)))
  }

  @Test
  fun normalisesRotationLikePdfBox() {
    assertEquals(270, StampGeometry.normalizeRotation(-90))
    assertEquals(90, StampGeometry.normalizeRotation(450))
    assertEquals(0, StampGeometry.normalizeRotation(45))
  }
}
