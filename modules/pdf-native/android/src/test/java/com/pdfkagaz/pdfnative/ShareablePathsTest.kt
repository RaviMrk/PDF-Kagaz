package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareablePathsTest {
  private val dataDir = "/data/user/0/com.pdfkagaz.app"
  private val readerDir = "/data/user/0/com.pdfkagaz.app/cache/reader"

  private fun shareable(path: String) = ShareablePaths.isShareable(path, dataDir, readerDir)

  @Test
  fun sharedStorageFilesAreShareable() {
    assertTrue(shareable("/storage/emulated/0/Documents/PDFToolkit/a.pdf"))
    assertTrue(shareable("/storage/1234-ABCD/Download/b.pdf"))
  }

  @Test
  fun readerCacheCopiesAreShareable() {
    assertTrue(shareable("/data/user/0/com.pdfkagaz.app/cache/reader/0123.pdf"))
  }

  @Test
  fun otherAppPrivateFilesAreNot() {
    assertFalse(shareable("/data/user/0/com.pdfkagaz.app/databases/app.db"))
    assertFalse(shareable("/data/user/0/com.pdfkagaz.app/cache/thumbs/a.jpg"))
    assertFalse(shareable("/data/user/0/com.pdfkagaz.app"))
    assertFalse(shareable("/data/user/0/com.pdfkagaz.app/cache/reader"))
  }

  @Test
  fun prefixLookalikesAreNotConfused() {
    assertTrue(shareable("/data/user/0/com.pdfkagaz.appx/a.pdf"))
    assertFalse(shareable("/data/user/0/com.pdfkagaz.app/cache/readerx/a.pdf"))
  }
}
