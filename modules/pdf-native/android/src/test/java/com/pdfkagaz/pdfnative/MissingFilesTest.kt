package com.pdfkagaz.pdfnative

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MissingFilesTest {
  private val roots = listOf("/storage/emulated/0", "/storage/1A2B-3C4D")

  private fun hidden(scheme: String?, path: String?, authority: String?, access: Boolean) =
    MissingFiles.mayBeHidden(scheme, path, authority, roots, hasStorageAccess = access)

  @Test
  fun aFileOnAMountedVolumeMayBeHiddenWithoutStorageAccess() {
    assertTrue(hidden("file", "/storage/emulated/0/Download/a.pdf", null, access = false))
    assertTrue(hidden("file", "/storage/1A2B-3C4D/Docs/a.pdf", null, access = false))
  }

  @Test
  fun aMediaStoreItemMayBeHiddenWithoutStorageAccess() {
    assertTrue(hidden("content", "/external/file/42", "media", access = false))
  }

  @Test
  fun withStorageAccessMissingMeansGone() {
    assertFalse(hidden("file", "/storage/emulated/0/Download/a.pdf", null, access = true))
    assertFalse(hidden("content", "/external/file/42", "media", access = true))
  }

  @Test
  fun otherProvidersAndPathsAreNeverHiddenByStorageAccess() {
    assertFalse(hidden("content", "/document/42", "com.android.providers.downloads.documents", access = false))
    assertFalse(hidden("content", "/x", "media.evil", access = false))
    assertFalse(hidden("file", "/data/user/0/x/cache/reader/a.pdf", null, access = false))
    assertFalse(hidden("file", "/storage/emulated/01/a.pdf", null, access = false))
    assertFalse(hidden("file", null, null, access = false))
    assertFalse(hidden(null, "/storage/emulated/0/a.pdf", null, access = false))
  }
}
