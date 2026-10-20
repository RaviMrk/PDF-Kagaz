package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ThumbKeyTest {
  private val uri = "file:///storage/emulated/0/Download/a.pdf"
  private val base = ThumbKey.of(uri, 1000L, 1_700_000_000_000L, 1, 240)

  @Test
  fun sameInputsGiveSameLowercaseHexKey() {
    assertEquals(base, ThumbKey.of(uri, 1000L, 1_700_000_000_000L, 1, 240))
    assertEquals(40, base.length)
    assertTrue(base.matches(Regex("[0-9a-f]{40}")))
  }

  @Test
  fun anyChangedInputChangesTheKey() {
    assertNotEquals(base, ThumbKey.of(uri, 1001L, 1_700_000_000_000L, 1, 240))
    assertNotEquals(base, ThumbKey.of(uri, 1000L, 1_700_000_000_001L, 1, 240))
    assertNotEquals(base, ThumbKey.of(uri, 1000L, 1_700_000_000_000L, 2, 240))
    assertNotEquals(base, ThumbKey.of(uri, 1000L, 1_700_000_000_000L, 1, 480))
    assertNotEquals(base, ThumbKey.of("$uri.x", 1000L, 1_700_000_000_000L, 1, 240))
  }

  @Test
  fun devanagariUriWorks() {
    val key = ThumbKey.of("file:///storage/emulated/0/Documents/अहवाल.pdf", 10L, 20L, 1, 240)
    assertTrue(key.matches(Regex("[0-9a-f]{40}")))
    assertNotEquals(key, ThumbKey.of("file:///storage/emulated/0/Documents/अहवाल2.pdf", 10L, 20L, 1, 240))
  }
}
