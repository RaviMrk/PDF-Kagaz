package com.pdfkagaz.pdfnative

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class StatColumnsTest {
  @Test
  fun kindFollowsDocumentFlagThenAuthority() {
    assertEquals(StatColumns.Kind.DOCUMENT, StatColumns.kindOf(isDocument = true, authority = "com.android.externalstorage.documents"))
    assertEquals(StatColumns.Kind.MEDIA_STORE, StatColumns.kindOf(isDocument = false, authority = "media"))
    // FileProvider shares (WhatsApp, Gmail) only promise OpenableColumns.
    assertEquals(StatColumns.Kind.OPENABLE, StatColumns.kindOf(isDocument = false, authority = "com.whatsapp.provider.media"))
    assertEquals(StatColumns.Kind.OPENABLE, StatColumns.kindOf(isDocument = false, authority = null))
  }

  @Test
  fun openableProjectionAsksOnlyForNameAndSize() {
    assertArrayEquals(arrayOf("_display_name", "_size"), StatColumns.projection(StatColumns.Kind.OPENABLE))
    assertArrayEquals(arrayOf("_display_name", "_size", "date_modified"), StatColumns.projection(StatColumns.Kind.MEDIA_STORE))
    assertArrayEquals(arrayOf("_display_name", "_size", "last_modified"), StatColumns.projection(StatColumns.Kind.DOCUMENT))
  }

  @Test
  fun missingOrNullColumnsFallBack() {
    // A provider that returns no modification column: 0 means "unknown".
    assertEquals(UriStat("a.pdf", 10L, 0L), StatColumns.toStat(StatColumns.Kind.OPENABLE, "a.pdf", 10L, null))
    assertEquals(UriStat("", 0L, 0L), StatColumns.toStat(StatColumns.Kind.OPENABLE, null, null, null))
  }

  @Test
  fun mediaStoreSecondsBecomeMillis() {
    assertEquals(UriStat("a.pdf", 1L, 5_000L), StatColumns.toStat(StatColumns.Kind.MEDIA_STORE, "a.pdf", 1L, 5L))
    assertEquals(UriStat("a.pdf", 1L, 5L), StatColumns.toStat(StatColumns.Kind.DOCUMENT, "a.pdf", 1L, 5L))
  }
}
