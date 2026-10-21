package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UriAccessTest {
  private val own = "com.pdfkagaz.pdftoolkit"
  private val ownAuthorities = setOf("$own.pdfnative.files", "$own.provider", "$own.FileSystemFileProvider")
  private val rules = PathRules(
    volumeRoots = listOf("/storage/emulated/0"),
    appDirs = listOf("/storage/emulated/0/Android/data/$own"),
    cacheDirs = listOf("/data/user/0/$own/cache/reader", "/data/user/0/$own/cache/share"),
  )

  private fun file(path: String?) = UriAccess.isAllowed("file", path, null, null, own, ownAuthorities, rules)

  private fun content(authority: String?, authorityPackage: String?) =
    UriAccess.isAllowed("content", null, authority, authorityPackage, own, ownAuthorities, rules)

  @Test
  fun filesFollowTheAllowlist() {
    assertTrue(file("/storage/emulated/0/Download/a.pdf"))
    assertTrue(file("/data/user/0/$own/cache/reader/0123.pdf"))
    assertFalse(file("/data/user/0/$own/databases/app.db"))
    assertFalse(file("/proc/self/maps"))
    assertFalse(file("/storage/emulated/0/Android/data/$own/files/x.pdf"))
    assertFalse(file(null))
  }

  @Test
  fun foreignAuthorityIsAllowed() {
    assertTrue(content("com.whatsapp.provider.media", "com.whatsapp"))
    assertTrue(content("com.android.externalstorage.documents", "com.android.externalstorage"))
  }

  @Test
  fun foreignAuthorityWithNullLookupIsAllowed() {
    // Package visibility (API 30+) can hide a sender's provider; the stat then decides.
    assertTrue(content("com.hidden.provider", null))
  }

  @Test
  fun ownDeclaredAuthorityIsRefusedEvenWhenTheLookupMisses() {
    assertFalse(content("$own.pdfnative.files", null))
    assertFalse(content("$own.provider", null))
    assertFalse(content("${own.uppercase()}.PDFNATIVE.FILES", null))
  }

  @Test
  fun authorityOwnedByOurPackageIsRefused() {
    assertFalse(content("$own.undeclared", own))
  }

  @Test
  fun userInfoAliasPortAndEncodingAreRefused() {
    // content://0@<pkg>.pdfnative.files/… : ContentResolver strips "0@" and reaches our provider.
    assertFalse(content("0@$own.pdfnative.files", null))
    assertFalse(content("0@com.whatsapp.provider.media", "com.whatsapp"))
    assertFalse(content("0%40$own.pdfnative.files", null))
    assertFalse(content("com.whatsapp.provider.media:80", "com.whatsapp"))
  }

  @Test
  fun missingAuthorityIsRefused() {
    assertFalse(content(null, null))
    assertFalse(content("", "com.whatsapp"))
    assertFalse(content(" ", null))
  }

  @Test
  fun otherSchemesAreRefused() {
    assertFalse(UriAccess.isAllowed("android.resource", null, null, null, own, ownAuthorities, rules))
    assertFalse(UriAccess.isAllowed(null, null, null, null, own, ownAuthorities, rules))
  }
}
