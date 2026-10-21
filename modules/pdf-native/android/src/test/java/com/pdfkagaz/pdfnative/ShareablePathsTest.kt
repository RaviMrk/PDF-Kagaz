package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareablePathsTest {
  private val pkg = "com.pdfkagaz.app"
  private val cache = "/data/user/0/$pkg/cache"
  private val rules = PathRules(
    volumeRoots = listOf("/storage/emulated/0", "/storage/1A2B-3C4D"),
    appDirs = listOf(
      "/storage/emulated/0/Android/data/$pkg",
      "/storage/1A2B-3C4D/Android/data/$pkg",
      "/storage/emulated/0/Android/obb/$pkg",
    ),
    cacheDirs = listOf("$cache/reader", "$cache/share"),
  )

  private fun shareable(path: String, with: PathRules = rules) = ShareablePaths.isShareable(path, with)

  @Test
  fun filesOnMountedVolumesAreShareable() {
    assertTrue(shareable("/storage/emulated/0/Download/a.pdf"))
    assertTrue(shareable("/storage/emulated/0/Documents/PDFToolkit/a.pdf"))
    assertTrue(shareable("/storage/1A2B-3C4D/Docs/a.pdf"))
  }

  @Test
  fun unmountedVolumeIsRefused() {
    val primaryOnly = rules.copy(volumeRoots = listOf("/storage/emulated/0"))
    assertFalse(shareable("/storage/1A2B-3C4D/Docs/a.pdf", primaryOnly))
  }

  @Test
  fun cacheCopiesAreShareable() {
    assertTrue(shareable("$cache/reader/0123.pdf"))
    assertTrue(shareable("$cache/share/abc/a.pdf"))
  }

  @Test
  fun procIsRefused() {
    assertFalse(shareable("/proc/self/maps"))
    assertFalse(shareable("/proc/1234/environ"))
    assertFalse(shareable("/proc/self/fd/3"))
    assertFalse(shareable("/proc/1234/fd/3"))
    assertFalse(shareable("/memfd:x (deleted)"))
  }

  @Test
  fun appDataAndSystemAreRefused() {
    assertFalse(shareable("/data/data/$pkg/databases/app.db"))
    assertFalse(shareable("/data/user/0/$pkg/files/x"))
    assertFalse(shareable("$cache/thumbs/a.jpg"))
    assertFalse(shareable("/system/etc/hosts"))
    assertFalse(shareable("/sdcard/Download/a.pdf"))
  }

  @Test
  fun appSpecificDirsOnVolumesAreRefused() {
    assertFalse(shareable("/storage/emulated/0/Android/data/$pkg/x"))
    assertFalse(shareable("/storage/1A2B-3C4D/Android/data/$pkg/cache/a.pdf"))
    assertFalse(shareable("/storage/emulated/0/Android/obb/$pkg/main.obb"))
  }

  @Test
  fun rootsThemselvesAndLookalikesAreNotConfused() {
    assertFalse(shareable("/storage/emulated/0"))
    assertFalse(shareable("$cache/reader"))
    assertFalse(shareable("/storage/emulated/01/a.pdf"))
    assertFalse(shareable("$cache/readerx/a.pdf"))
    assertTrue(shareable("/storage/emulated/0/Android/data/${pkg}x/a.pdf"))
  }

  @Test
  fun isInsideMeansStrictlyBelow() {
    assertTrue(ShareablePaths.isInside("$cache/reader/a.pdf", "$cache/reader"))
    assertFalse(ShareablePaths.isInside("$cache/reader", "$cache/reader"))
    assertFalse(ShareablePaths.isInside("$cache/readerx/a.pdf", "$cache/reader"))
  }
}
