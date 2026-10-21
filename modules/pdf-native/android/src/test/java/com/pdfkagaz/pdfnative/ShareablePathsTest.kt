package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareablePathsTest {
  private val pkg = "com.pdfkagaz.app"
  private val dataDir = "/data/user/0/$pkg"
  private val privateDirs = listOf(
    dataDir,
    "/data/user_de/0/$pkg",
    "/storage/emulated/0/Android/data/$pkg",
    "/storage/1234-ABCD/Android/data/$pkg",
    "/storage/emulated/0/Android/obb/$pkg",
  )
  private val readerDir = "$dataDir/cache/reader"

  private fun shareable(path: String) = ShareablePaths.isShareable(path, privateDirs, readerDir)

  @Test
  fun sharedStorageFilesAreShareable() {
    assertTrue(shareable("/storage/emulated/0/Documents/PDFToolkit/a.pdf"))
    assertTrue(shareable("/storage/1234-ABCD/Download/b.pdf"))
  }

  @Test
  fun readerCacheCopiesAreShareable() {
    assertTrue(shareable("$readerDir/0123.pdf"))
  }

  @Test
  fun otherAppPrivateFilesAreNot() {
    assertFalse(shareable("$dataDir/databases/app.db"))
    assertFalse(shareable("$dataDir/cache/thumbs/a.jpg"))
    assertFalse(shareable(dataDir))
    assertFalse(shareable(readerDir))
  }

  @Test
  fun deviceProtectedAndExternalAppDirsAreNot() {
    assertFalse(shareable("/data/user_de/0/$pkg/shared_prefs/x.xml"))
    assertFalse(shareable("/storage/emulated/0/Android/data/$pkg/files/a.pdf"))
    assertFalse(shareable("/storage/1234-ABCD/Android/data/$pkg/cache/a.pdf"))
    assertFalse(shareable("/storage/emulated/0/Android/obb/$pkg/main.obb"))
  }

  @Test
  fun prefixLookalikesAreNotConfused() {
    assertTrue(shareable("/data/user/0/${pkg}x/a.pdf"))
    assertTrue(shareable("/storage/emulated/0/Android/data/${pkg}x/a.pdf"))
    assertFalse(shareable("$dataDir/cache/readerx/a.pdf"))
  }

  @Test
  fun isInsideMeansStrictlyBelow() {
    assertTrue(ShareablePaths.isInside("$readerDir/a.pdf", readerDir))
    assertFalse(ShareablePaths.isInside(readerDir, readerDir))
    assertFalse(ShareablePaths.isInside("${readerDir}x/a.pdf", readerDir))
  }
}
