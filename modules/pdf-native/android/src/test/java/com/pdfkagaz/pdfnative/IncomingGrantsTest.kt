package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IncomingGrantsTest {
  private fun doc(n: Int, time: Long) = PersistedGrant("content://com.whatsapp.provider/doc/$n", time)

  private fun tree(n: Int, time: Long) =
    PersistedGrant("content://com.android.externalstorage.documents/tree/primary%3AF$n", time)

  @Test
  fun recognisesTreeUris() {
    assertTrue(IncomingGrants.isTree("content://com.android.externalstorage.documents/tree/primary%3ADocs"))
    assertFalse(IncomingGrants.isTree("content://com.android.externalstorage.documents/document/primary%3Aa.pdf"))
    assertFalse(IncomingGrants.isTree("content://com.whatsapp.provider/tree"))
    assertFalse(IncomingGrants.isTree("file:///tree/a"))
  }

  @Test
  fun underTheLimitNothingIsReleased() {
    assertEquals(emptyList<String>(), IncomingGrants.toRelease(listOf(doc(1, 1), doc(2, 2)), keep = 2))
  }

  @Test
  fun releasesTheOldestDocumentGrantsBeyondTheLimit() {
    val grants = listOf(doc(1, 30), doc(2, 10), doc(3, 20), doc(4, 40))
    assertEquals(listOf(doc(2, 10).uri, doc(3, 20).uri), IncomingGrants.toRelease(grants, keep = 2))
  }

  @Test
  fun neverReleasesFolderTreeGrants() {
    val grants = listOf(tree(1, 1), tree(2, 2), doc(1, 3), doc(2, 4))
    assertEquals(listOf(doc(1, 3).uri), IncomingGrants.toRelease(grants, keep = 1))
    assertEquals(emptyList<String>(), IncomingGrants.toRelease(listOf(tree(1, 1), tree(2, 2)), keep = 0))
  }

  @Test
  fun keepIsAtMostThirtyTwo() {
    assertTrue(IncomingGrants.MAX_DOCUMENT_GRANTS <= 32)
  }
}
