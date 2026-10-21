package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Test

class OwnAuthoritiesTest {
  @Test
  fun splitsMultiAuthorityProvidersAndSkipsNulls() {
    assertEquals(
      setOf("a.files", "a.extra", "b.provider"),
      UriAccess.authoritiesOf(listOf("a.files;a.extra", null, "b.provider", " ; ")),
    )
  }
}
