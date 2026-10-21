package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UriAccessTest {
  private val own = "com.pdfkagaz.pdftoolkit"
  private val dataDir = "/data/user/0/$own"
  private val privateDirs = listOf(dataDir, "/storage/emulated/0/Android/data/$own")
  private val readerDir = "$dataDir/cache/reader"

  private fun file(path: String?) = UriAccess.isAllowed("file", path, null, null, own, privateDirs, readerDir)

  private fun content(authority: String?, authorityPackage: String?) =
    UriAccess.isAllowed("content", null, authority, authorityPackage, own, privateDirs, readerDir)

  @Test
  fun sharedStorageAndReaderCopiesAreAllowed() {
    assertTrue(file("/storage/emulated/0/Download/a.pdf"))
    assertTrue(file("$readerDir/0123.pdf"))
  }

  @Test
  fun appPrivateFilesAreRefused() {
    assertFalse(file("$dataDir/databases/app.db"))
    assertFalse(file("/storage/emulated/0/Android/data/$own/files/x.pdf"))
    assertFalse(file(null))
  }

  @Test
  fun foreignAuthorityIsAllowed() {
    assertTrue(content("com.whatsapp.provider.media", "com.whatsapp"))
    assertTrue(content("com.android.externalstorage.documents", "com.android.externalstorage"))
  }

  @Test
  fun ownAuthorityIsRefused() {
    assertFalse(content("$own.pdfnative.files", own))
    assertFalse(content("$own.provider", own))
  }

  @Test
  fun userInfoAliasIsRefused() {
    // content://0@<pkg>.pdfnative.files/… : PackageManager misses it, ContentResolver strips "0@".
    assertFalse(content("0@$own.pdfnative.files", null))
    assertFalse(content("0@com.whatsapp.provider.media", "com.whatsapp"))
    assertFalse(content("0%40$own.pdfnative.files", "com.whatsapp"))
  }

  @Test
  fun portIsRefused() {
    assertFalse(content("com.whatsapp.provider.media:80", "com.whatsapp"))
  }

  @Test
  fun unresolvedOrMissingAuthorityIsRefused() {
    assertFalse(content("com.unknown.provider", null))
    assertFalse(content(null, null))
    assertFalse(content("", "com.whatsapp"))
  }

  @Test
  fun otherSchemesAreRefused() {
    assertFalse(UriAccess.isAllowed("android.resource", null, null, null, own, privateDirs, readerDir))
    assertFalse(UriAccess.isAllowed(null, null, null, null, own, privateDirs, readerDir))
  }
}
