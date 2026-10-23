package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanResultsTest {
  private val cache = "/data/user/0/p/cache"

  @Test
  fun pageUrisDropBlanksAndDuplicatesAndKeepTheFirstMax() {
    assertEquals(
      listOf("file:///c/a.jpg"),
      ScanResults.pageUris(listOf("file:///c/a.jpg", "", "file:///c/a.jpg", "file:///c/b.jpg"), 1),
    )
    assertEquals(
      listOf("file:///c/a.jpg", "file:///c/b.jpg"),
      ScanResults.pageUris(listOf("file:///c/a.jpg", " ", "file:///c/a.jpg", "file:///c/b.jpg"), 5),
    )
  }

  @Test
  fun scannerFilesAreStrictlyInsideCacheOutsideOurOwnFolders() {
    assertTrue(ScanResults.isOwnScannerFile(cache, "$cache/mlkit_docscan_ui_client/1.jpg"))
    assertFalse(ScanResults.isOwnScannerFile(cache, "$cache/tools/img-a/src-0"))
    assertFalse(ScanResults.isOwnScannerFile(cache, cache))
    assertFalse(ScanResults.isOwnScannerFile(cache, "/data/user/0/p/files/x.jpg"))
    assertFalse(ScanResults.isOwnScannerFile(cache, "/data/user/0/p/cachex/1.jpg"))
  }

  @Test
  fun ourOwnCacheFoldersAreNeverScannerFiles() {
    for (dir in listOf("tools", "tool-thumbs", "reader", "share")) {
      assertFalse(dir, ScanResults.isOwnScannerFile(cache, "$cache/$dir"))
      assertFalse(dir, ScanResults.isOwnScannerFile(cache, "$cache/$dir/x.jpg"))
    }
    assertTrue(ScanResults.isOwnScannerFile("$cache/", "$cache/toolsx/1.jpg"))
  }
}
