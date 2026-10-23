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

  @Test
  fun maxOverloadKeepsUpToTheGivenCount() {
    assertEquals(100, PickerResults.urisOf(null, (1..120).map { "content://m/$it" }, 100).size)
    assertEquals(50, PickerResults.urisOf(null, (1..120).map { "content://m/$it" }).size)
  }

  @Test
  fun limitedKeepsTheFirstMaxAndCountsTheDroppedPicks() {
    // The ACTION_OPEN_DOCUMENT fallback has no item limit: 80 picked with room for 60.
    val clip = (1..80).map { "content://m/$it" }
    val picked = PickerResults.limited(null, clip, 60)
    assertEquals(clip.take(60), picked.uris)
    assertEquals(20, picked.dropped)
  }

  @Test
  fun limitedCountsOnlyDistinctNonBlankPicksAsDropped() {
    val picked = PickerResults.limited(null, listOf("content://a", "content://a", "", "content://b", "content://c"), 2)
    assertEquals(listOf("content://a", "content://b"), picked.uris)
    assertEquals(1, picked.dropped)
  }

  @Test
  fun limitedDropsNothingWithinTheLimit() {
    assertEquals(PickerResults.Limited(listOf("content://a"), 0), PickerResults.limited("content://a", emptyList(), 5))
    assertEquals(PickerResults.Limited(emptyList(), 0), PickerResults.limited(null, emptyList(), 5))
  }

  @Test
  fun limitedWithANonPositiveMaxKeepsNothing() {
    assertEquals(PickerResults.Limited(emptyList(), 2), PickerResults.limited(null, listOf("content://a", "content://b"), 0))
  }
}
