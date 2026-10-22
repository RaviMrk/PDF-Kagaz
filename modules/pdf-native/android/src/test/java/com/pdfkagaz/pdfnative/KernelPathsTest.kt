package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The kernel's path of an opened descriptor under each storage alias maps back to its volume (F2). */
class KernelPathsTest {
  private val pkg = "com.pdfkagaz.pdftoolkit"
  private val rules = PathRules(
    volumeRoots = listOf("/storage/emulated/0", "/storage/1A2B-3C4D"),
    appDirs = listOf(
      "/storage/emulated/0/Android/data/$pkg",
      "/storage/emulated/0/Android/obb/$pkg",
      "/storage/1A2B-3C4D/Android/data/$pkg",
    ),
    cacheDirs = listOf("/data/data/$pkg/cache/reader", "/data/data/$pkg/cache/share"),
  )

  private fun ok(path: String, realRoots: List<Pair<String, String>> = emptyList()) =
    KernelPaths.isShareable(path, rules, realRoots)

  @Test
  fun canonicalPathsKeepWorking() {
    assertTrue(ok("/storage/emulated/0/Download/a.pdf"))
    assertTrue(ok("/data/data/$pkg/cache/share/x/a.pdf"))
    assertFalse(ok("/storage/emulated/0/Android/data/$pkg/files/a.pdf"))
  }

  @Test
  fun runtimeViewsMapToTheirVolume() {
    for (view in listOf("default", "read", "write", "full")) {
      assertTrue(ok("/mnt/runtime/$view/emulated/0/Download/a.pdf"))
      assertTrue(ok("/mnt/runtime/$view/1A2B-3C4D/Docs/a.pdf"))
      assertFalse(ok("/mnt/runtime/$view/emulated/0/Android/data/$pkg/files/a.pdf"))
      assertFalse(ok("/mnt/runtime/$view/emulated/0/Android/obb/$pkg/main.obb"))
      assertFalse(ok("/mnt/runtime/$view/1A2B-3C4D/Android/data/$pkg/a.pdf"))
    }
  }

  @Test
  fun perUserMountsMapToTheirVolume() {
    assertTrue(ok("/mnt/user/0/emulated/0/Download/a.pdf"))
    assertTrue(ok("/mnt/user/0/1A2B-3C4D/Docs/a.pdf"))
    assertFalse(ok("/mnt/user/0/emulated/0/Android/data/$pkg/a.pdf"))
  }

  @Test
  fun dataMediaMapsToThePrimaryVolume() {
    assertTrue(ok("/data/media/0/Download/a.pdf"))
    assertFalse(ok("/data/media/0/Android/data/$pkg/a.pdf"))
    assertFalse(ok("/data/media/0/Android/obb/$pkg/main.obb"))
    assertFalse(ok("/data/media/obb/$pkg/main.obb"))
  }

  @Test
  fun mediaRwMapsToItsVolume() {
    assertTrue(ok("/mnt/media_rw/1A2B-3C4D/Docs/a.pdf"))
    assertFalse(ok("/mnt/media_rw/1A2B-3C4D/Android/data/$pkg/a.pdf"))
  }

  @Test
  fun realpathOfAVolumeRootMapsBack() {
    val real = listOf("/mnt/pass_through/0/emulated/0" to "/storage/emulated/0")
    assertTrue(ok("/mnt/pass_through/0/emulated/0/Download/a.pdf", real))
    assertFalse(ok("/mnt/pass_through/0/emulated/0/Android/data/$pkg/a.pdf", real))
    assertFalse(ok("/mnt/pass_through/0/emulated/0", real))
    assertFalse(ok("/mnt/pass_through/0/emulated/01/a.pdf", real))
  }

  @Test
  fun aliasesOfOtherUsersOrUnmountedVolumesStayRefused() {
    assertFalse(ok("/mnt/runtime/default/emulated/10/Download/a.pdf"))
    assertFalse(ok("/data/media/10/Download/a.pdf"))
    assertFalse(ok("/mnt/media_rw/9999-0000/a.pdf"))
    assertFalse(ok("/mnt/user/0/9999-0000/a.pdf"))
  }

  @Test
  fun nonStoragePathsStayRefused() {
    assertFalse(ok("/proc/self/maps"))
    assertFalse(ok("/data/data/$pkg/databases/app.db"))
    assertFalse(ok("/data/media/0"))
    assertFalse(ok("/mnt/runtime/default/emulated/0"))
    assertFalse(ok("/mnt/runtime/default/emulated/0/../../../../data/data/$pkg/databases/app.db"))
  }

  @Test
  fun emptySegmentsAreRefused() {
    assertTrue(KernelPaths.candidates("/storage/emulated/0//Android/data/$pkg/a.pdf", emptyList()).isEmpty())
    assertTrue(KernelPaths.candidates("/mnt/user/0/emulated/0//Download/a.pdf", emptyList()).isEmpty())
    assertTrue(KernelPaths.candidates("/storage/emulated/0/Download/", emptyList()).isEmpty())
    val plain = "/storage/emulated/0/Download/a.pdf"
    assertEquals(listOf(plain), KernelPaths.candidates(plain, emptyList()))
  }
}
