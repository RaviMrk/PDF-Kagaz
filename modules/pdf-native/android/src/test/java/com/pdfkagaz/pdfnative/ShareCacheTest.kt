package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareCacheTest {
  private val mb = 1024L * 1024

  @Test
  fun dirNameIsAHashThatTracksTheSource() {
    val name = ShareCache.dirNameFor("file:///storage/emulated/0/a.pdf", 10, 5)
    assertTrue(name.matches(Regex("[0-9a-f]{40}")))
    assertEquals(name, ShareCache.dirNameFor("file:///storage/emulated/0/a.pdf", 10, 5))
    assertNotEquals(name, ShareCache.dirNameFor("file:///storage/emulated/0/a.pdf", 11, 5))
    assertNotEquals(name, ShareCache.dirNameFor("file:///storage/emulated/0/a.pdf", 10, 6))
    assertNotEquals(name, ShareCache.dirNameFor("file:///storage/emulated/0/b.pdf", 10, 5))
  }

  @Test
  fun copyKeepsTheDisplayNameForTheRecipient() {
    assertEquals("अहवाल 1.pdf", ShareCache.fileNameFor("अहवाल 1.pdf"))
    assertEquals("document.pdf", ShareCache.fileNameFor(""))
    assertEquals("document.pdf", ShareCache.fileNameFor(".."))
    assertEquals("document.pdf", ShareCache.fileNameFor("a/b.pdf"))
  }

  @Test
  fun evictsPartialsAndTheOldestCopiesBeyondTheLimits() {
    val hash = { n: Int -> n.toString().repeat(40) }
    val entries = (1..5).map { CacheEntry(hash(it), it.toLong(), mb) } + CacheEntry("${hash(9)}.part", 9, mb)
    assertEquals(
      listOf(hash(1), hash(2), "${hash(9)}.part").sorted(),
      ShareCache.toDelete(entries, keep = hash(3)).sorted(),
    )
    val big = listOf(CacheEntry(hash(1), 1, 200 * mb), CacheEntry(hash(2), 2, 200 * mb))
    assertEquals(listOf(hash(1)), ShareCache.toDelete(big, keep = hash(2)))
  }

  @Test
  fun neverEvictsUnknownEntries() {
    assertFalse(ShareCache.toDelete(listOf(CacheEntry("stray", 1, mb)), keep = "x").contains("stray"))
  }
}
