package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IncomingGrantsTest {
  private fun doc(n: Int, time: Long) = PersistedGrant("content://com.whatsapp.provider/doc/$n", time)

  private val folderA = PersistedGrant("content://com.android.externalstorage.documents/tree/primary%3AA", 1)
  private val folderB = PersistedGrant("content://com.android.externalstorage.documents/tree/primary%3AB", 2)
  private val folders = setOf(folderA.uri, folderB.uri)

  @Test
  fun underTheLimitNothingIsReleased() {
    assertEquals(emptyList<String>(), IncomingGrants.toRelease(listOf(doc(1, 1), doc(2, 2)), folders, keep = 2))
  }

  @Test
  fun releasesTheOldestDocumentGrantsBeyondTheLimit() {
    val grants = listOf(doc(1, 30), doc(2, 10), doc(3, 20), doc(4, 40))
    assertEquals(listOf(doc(2, 10).uri, doc(3, 20).uri), IncomingGrants.toRelease(grants, folders, keep = 2))
  }

  @Test
  fun neverReleasesRecordedFolderGrants() {
    val grants = listOf(folderA, folderB, doc(1, 3), doc(2, 4))
    assertEquals(listOf(doc(1, 3).uri), IncomingGrants.toRelease(grants, folders, keep = 1))
    assertEquals(emptyList<String>(), IncomingGrants.toRelease(listOf(folderA, folderB), folders, keep = 0))
  }

  @Test
  fun aTreeUriNotRecordedAsAFolderIsAnIncomingGrant() {
    // Folder-ness comes from what pickFolder recorded, not from the URI's shape.
    val stray = PersistedGrant("content://com.android.externalstorage.documents/tree/primary%3AX", 1)
    assertEquals(listOf(stray.uri), IncomingGrants.toRelease(listOf(stray, folderA), folders, keep = 0))
  }

  @Test
  fun folderRootsAreSeededFromExistingGrantsOnce() {
    // Before incoming grants existed, every persisted grant came from pickFolder.
    assertEquals(setOf("a", "b"), IncomingGrants.folderRootsOrSeed(null, listOf("a", "b")))
    assertEquals(setOf("a"), IncomingGrants.folderRootsOrSeed(setOf("a"), listOf("a", "b")))
  }

  @Test
  fun keepIsAtMostThirtyTwo() {
    assertTrue(IncomingGrants.MAX_DOCUMENT_GRANTS <= 32)
  }
}
