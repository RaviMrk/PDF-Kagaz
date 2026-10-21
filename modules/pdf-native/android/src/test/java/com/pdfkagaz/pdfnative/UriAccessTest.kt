package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UriAccessTest {
  private val own = "com.pdfkagaz.pdftoolkit"
  private val dataDir = "/data/user/0/com.pdfkagaz.pdftoolkit"
  private val readerDir = "$dataDir/cache/reader"

  private fun file(path: String?) = UriAccess.isAllowed("file", path, null, own, dataDir, readerDir)

  private fun content(authorityPackage: String?) =
    UriAccess.isAllowed("content", null, authorityPackage, own, dataDir, readerDir)

  @Test
  fun sharedStorageAndReaderCopiesAreAllowed() {
    assertTrue(file("/storage/emulated/0/Download/a.pdf"))
    assertTrue(file("$readerDir/0123.pdf"))
  }

  @Test
  fun appPrivateFilesAreRefused() {
    assertFalse(file("$dataDir/databases/app.db"))
    assertFalse(file("$dataDir/files/mmkv/default"))
  }

  @Test
  fun fileWithoutPathIsRefused() {
    assertFalse(file(null))
  }

  @Test
  fun otherAppsProvidersAreAllowed() {
    assertTrue(content("com.android.providers.downloads"))
    assertTrue(content("com.whatsapp"))
  }

  @Test
  fun unknownAuthorityIsLeftToTheStat() {
    assertTrue(content(null))
  }

  @Test
  fun ourOwnProvidersAreRefused() {
    // pdfnative.files, blob-util's provider, FileSystemFileProvider…: all owned by this package.
    assertFalse(content(own))
  }

  @Test
  fun otherSchemesAreRefused() {
    assertFalse(UriAccess.isAllowed("android.resource", null, null, own, dataDir, readerDir))
    assertFalse(UriAccess.isAllowed(null, null, null, own, dataDir, readerDir))
  }
}
