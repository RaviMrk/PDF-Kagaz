package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CacheCleanerTest {
  @Test fun thumbsAndReaderAreCleared() {
    assertTrue(CacheCleaner.shouldDelete("thumbs/a.jpg", 0, 1))
    assertTrue(CacheCleaner.shouldDelete("reader/x.pdf", 0, 1))
  }

  @Test fun shareNeedsTenMinutes() {
    assertFalse(CacheCleaner.shouldDelete("share/h/a.pdf", 0, 599_999))
    assertTrue(CacheCleaner.shouldDelete("share/h/a.pdf", 0, 600_000))
  }

  @Test fun everythingElseIsKept() {
    assertFalse(CacheCleaner.shouldDelete("tools/img-a/src-0", 0, 10_000_000))
    assertFalse(CacheCleaner.shouldDelete("tool-thumbs/x", 0, 10_000_000))
    assertFalse(CacheCleaner.shouldDelete("mlkit_docscan_ui_client/1.jpg", 0, 10_000_000))
    assertFalse(CacheCleaner.shouldDelete("thumbs/../tools/x", 0, 10_000_000))
    assertFalse(CacheCleaner.shouldDelete("", 0, 10_000_000))
    assertFalse(CacheCleaner.shouldDelete("thumbs", 0, 10_000_000))
  }

  @Test fun readerCopiesOpenedRecentlyAreKept() {
    assertTrue(CacheCleaner.keepRecentReader("reader/x.pdf", 1_000, 2_000))
    assertFalse(CacheCleaner.keepRecentReader("reader/x.pdf", 0, 600_000))
    assertFalse(CacheCleaner.keepRecentReader("thumbs/x.jpg", 1_000, 2_000))
  }

  @Test fun clearWalksOnlyClearedDirsAndCountsBytes() {
    val root = kotlin.io.path.createTempDirectory("cache").toFile()
    try {
      val now = 10_000_000L
      fun make(path: String, age: Long, bytes: Int = 10) {
        val f = java.io.File(root, path)
        f.parentFile!!.mkdirs()
        f.writeBytes(ByteArray(bytes))
        f.setLastModified(now - age)
      }
      make("thumbs/a.jpg", 0)
      make("reader/old.pdf", 700_000)
      make("reader/new.pdf", 1_000)
      make("share/h/old.pdf", 700_000)
      make("share/h2/new.pdf", 1_000)
      make("tools/img-a/src-0", 700_000)
      make("tool-thumbs/img-a/0.jpg", 700_000)
      make("mlkit_docscan_ui_client/1.jpg", 700_000)
      val freed = CacheCleaner.clear(root, now)
      assertEquals(30L, freed)
      assertFalse(java.io.File(root, "thumbs/a.jpg").exists())
      assertFalse(java.io.File(root, "reader/old.pdf").exists())
      assertTrue(java.io.File(root, "reader/new.pdf").exists())
      assertFalse(java.io.File(root, "share/h/old.pdf").exists())
      assertTrue(java.io.File(root, "share/h2/new.pdf").exists())
      assertTrue(java.io.File(root, "tools/img-a/src-0").exists())
      assertTrue(java.io.File(root, "tool-thumbs/img-a/0.jpg").exists())
      assertTrue(java.io.File(root, "mlkit_docscan_ui_client/1.jpg").exists())
    } finally {
      root.deleteRecursively()
    }
  }
}
