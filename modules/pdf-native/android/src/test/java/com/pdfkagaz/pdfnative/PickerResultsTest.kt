package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PickerResultsTest {
  @Test
  fun singlePickComesFromData() {
    assertEquals(listOf("content://a/1"), PickerResults.urisOf("content://a/1", emptyList()))
  }

  @Test
  fun clipItemsWinOverDataAndAreDistinctWithoutBlanks() {
    assertEquals(
      listOf("content://b/1"),
      PickerResults.urisOf("content://a/1", listOf("content://b/1", "content://b/1", "")),
    )
  }

  @Test
  fun nothingPickedIsEmpty() {
    assertTrue(PickerResults.urisOf(null, emptyList()).isEmpty())
  }

  @Test
  fun keepsAtMostMaxItems() {
    val clip = (1..60).map { "content://b/$it" }
    val uris = PickerResults.urisOf(null, clip)
    assertEquals(PickerResults.MAX, uris.size)
    assertEquals(50, uris.size)
    assertEquals(clip.take(50), uris)
  }
}
