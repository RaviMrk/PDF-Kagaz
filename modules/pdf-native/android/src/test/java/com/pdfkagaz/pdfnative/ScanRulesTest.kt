package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanRulesTest {
  @Test
  fun skipsHiddenAndSystemFolders() {
    assertTrue(ScanRules.shouldSkipDir(".thumbnails", ".thumbnails"))
    assertTrue(ScanRules.shouldSkipDir("data", "Android/data"))
    assertTrue(ScanRules.shouldSkipDir("OBB", "android/OBB"))
    assertTrue(ScanRules.shouldSkipDir("lost+found", "lost+found"))
  }

  @Test
  fun keepsMediaAndRegularFolders() {
    assertFalse(ScanRules.shouldSkipDir("media", "Android/media"))
    assertFalse(ScanRules.shouldSkipDir("Download", "Download"))
  }

  @Test
  fun recognisesPdfNames() {
    assertTrue(ScanRules.isPdf("a.PDF"))
    assertFalse(ScanRules.isPdf(".hidden.pdf"))
    assertFalse(ScanRules.isPdf("a.pdf.txt"))
  }

  @Test
  fun buildsDisplayFolder() {
    assertEquals("", ScanRules.displayFolder("", null))
    assertEquals("Download/Reports", ScanRules.displayFolder("Download/Reports", null))
    assertEquals("SD card/Download", ScanRules.displayFolder("Download", "SD card"))
  }

  @Test
  fun derivesVolumeRootFromAppDir() {
    assertEquals("/storage/emulated/0", ScanRules.volumeRootFromAppDir("/storage/emulated/0/Android/data/com.x/files"))
    assertEquals("/storage/1A2B-3C4D", ScanRules.volumeRootFromAppDir("/storage/1A2B-3C4D/Android/data/com.x/files"))
    assertNull(ScanRules.volumeRootFromAppDir(null))
  }
}
