package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImagePublisherTest {
  @Test
  fun relativePathIsUnderPicturesPdfToolkit() {
    assertEquals("Pictures/PDFToolkit/Report pages", ImagePublisher.relativePathFor("Report pages"))
  }

  @Test
  fun aFolderWithSlashesAndControlCharactersIsCleaned() {
    assertEquals("Pictures/PDFToolkit/a_b_c pages", ImagePublisher.relativePathFor("a/b\\c\u0001 pages\u007f"))
  }

  @Test
  fun aFolderNameNeverEscapesOrHides() {
    val path = ImagePublisher.relativePathFor("../..")
    assertTrue(path.startsWith("Pictures/PDFToolkit/"))
    val folder = path.removePrefix("Pictures/PDFToolkit/")
    assertFalse(folder.startsWith("."))
    assertFalse('/' in folder)
    assertTrue(folder.isNotBlank())
  }

  @Test
  fun aLongFolderNameFitsTheNameLimit() {
    val folder = ImagePublisher.relativePathFor("अ".repeat(200)).removePrefix("Pictures/PDFToolkit/")
    assertTrue(folder.toByteArray(Charsets.UTF_8).size <= FileNames.MAX_NAME_BYTES)
  }

  @Test
  fun imageMimeFollowsTheExtension() {
    assertEquals("image/jpeg", ImagePublisher.mimeOf("a p1.jpg"))
    assertEquals("image/png", ImagePublisher.mimeOf("a p1.png"))
  }
}
