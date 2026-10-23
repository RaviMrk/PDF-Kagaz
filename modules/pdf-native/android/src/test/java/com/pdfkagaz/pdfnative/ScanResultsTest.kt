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

  @Test
  fun theScannerCacheFolderIsMlKitsUiClientFolder() {
    assertEquals("mlkit_docscan_ui_client", ScanResults.SCANNER_CACHE_DIR)
  }

  @Test
  fun staleScannerLeftoversAreFilesInTheScannerFolderOlderThanTheCutoff() {
    val scans = "$cache/mlkit_docscan_ui_client"
    assertTrue(ScanResults.isStaleScannerLeftover(cache, "$scans/1.jpg", 999, 1000))
    assertTrue(ScanResults.isStaleScannerLeftover("$cache/", "$scans/sub/2.jpg", 0, 1000))
    // This process's scans (at or after the cutoff) are left alone.
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$scans/1.jpg", 1000, 1000))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$scans/1.jpg", 5000, 1000))
  }

  @Test
  fun nothingOutsideTheScannerFolderIsAStaleLeftover() {
    val old = 0L
    val cutoff = 1000L
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/mlkit_docscan_ui_client", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/mlkit_docscan_ui_clientx/1.jpg", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/1.jpg", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/tools/img-a/src-0", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/reader/x.pdf", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "/data/user/0/p/files/mlkit_docscan_ui_client/1.jpg", old, cutoff))
    assertFalse(ScanResults.isStaleScannerLeftover(cache, "$cache/mlkit_docscan_ui_client/../tools/x", old, cutoff))
  }
}
