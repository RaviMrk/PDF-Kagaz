package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderCacheTest {
  private val mb = 1024L * 1024

  @Test
  fun fileNameIsAHashedPdfNameThatTracksSizeAndModification() {
    val name = ReaderCache.fileNameFor("content://a/1", 10, 5)
    assertTrue(name.endsWith(".pdf"))
    assertEquals(44, name.length)
    assertTrue(name.matches(Regex("[0-9a-f]{40}\\.pdf")))
    assertEquals(name, ReaderCache.fileNameFor("content://a/1", 10, 5))
    assertNotEquals(name, ReaderCache.fileNameFor("content://a/1", 11, 5))
    assertNotEquals(name, ReaderCache.fileNameFor("content://a/1", 10, 6))
    assertNotEquals(name, ReaderCache.fileNameFor("content://a/2", 10, 5))
  }

  @Test
  fun fileNameNeverCarriesTheSourceName() {
    val name = ReaderCache.fileNameFor("content://p/document/अहवाल %#? 1.pdf", 10, 5)
    assertTrue(name.matches(Regex("[0-9a-f]{40}\\.pdf")))
  }

  @Test
  fun copiesAreReusableOnlyWhenTheProviderReportsAModificationTime() {
    assertFalse(ReaderCache.reusable(0))
    assertTrue(ReaderCache.reusable(1))
  }

  @Test
  fun keepsTheNewestCopiesUpToTheFileLimit() {
    val entries = (1..5).map { CacheEntry("e$it.pdf", it.toLong(), mb) }
    assertEquals(listOf("e1.pdf", "e2.pdf"), ReaderCache.toDelete(entries, keep = "e3.pdf").sorted())
  }

  @Test
  fun dropsOlderCopiesThatWouldExceedTheByteLimit() {
    val entries = listOf(CacheEntry("keep.pdf", 2, 250 * mb), CacheEntry("x.pdf", 1, 100 * mb))
    assertEquals(listOf("x.pdf"), ReaderCache.toDelete(entries, keep = "keep.pdf"))
  }

  @Test
  fun neverDeletesTheKeptCopyEvenWhenItAloneExceedsTheByteLimit() {
    val entries = listOf(CacheEntry("big.pdf", 1, 400 * mb))
    assertEquals(emptyList<String>(), ReaderCache.toDelete(entries, keep = "big.pdf"))
  }

  @Test
  fun alwaysDeletesPartialCopies() {
    val entries = listOf(CacheEntry("keep.pdf", 2, mb), CacheEntry("y.pdf.part", 3, mb))
    assertEquals(listOf("y.pdf.part"), ReaderCache.toDelete(entries, keep = "keep.pdf"))
    assertEquals(listOf("y.pdf.part"), ReaderCache.toDelete(listOf(CacheEntry("y.pdf.part", 3, 1)), keep = "keep.pdf"))
  }
  private val readerDir = "/data/user/0/com.pdfkagaz/cache/reader"

  private fun thumbKey(path: String, modifiedAt: Long) =
    ThumbKey.of("file://$path", 1000, ReaderCache.stableModifiedAt(path, readerDir, modifiedAt), 1, 160)

  @Test
  fun readerCopyThumbKeysSurviveTheReuseTouch() {
    val copy = "$readerDir/${ReaderCache.fileNameFor("content://a/1", 1000, 5)}"
    // prepareReaderFile touches a reused copy (setLastModified) for LRU: its keys must not change.
    assertEquals(thumbKey(copy, 1_700_000_000_000), thumbKey(copy, 1_700_000_999_000))
    assertEquals(0L, ReaderCache.stableModifiedAt(copy, readerDir, 1_700_000_000_000))
  }

  @Test
  fun differentReaderCopiesGetDifferentThumbKeys() {
    val a = "$readerDir/${ReaderCache.fileNameFor("content://a/1", 1000, 5)}"
    val b = "$readerDir/${ReaderCache.fileNameFor("content://a/1", 1000, 6)}"
    assertNotEquals(thumbKey(a, 7), thumbKey(b, 7))
  }

  @Test
  fun filesOutsideTheReaderCacheKeepTheirModificationTime() {
    val path = "/storage/emulated/0/Download/a.pdf"
    assertEquals(42L, ReaderCache.stableModifiedAt(path, readerDir, 42))
    assertNotEquals(thumbKey(path, 1), thumbKey(path, 2))
    // A nested or sibling folder is not the reader cache.
    assertEquals(42L, ReaderCache.stableModifiedAt("$readerDir/sub/x.pdf", readerDir, 42))
    assertEquals(42L, ReaderCache.stableModifiedAt("${readerDir}2/x.pdf", readerDir, 42))
  }
}
