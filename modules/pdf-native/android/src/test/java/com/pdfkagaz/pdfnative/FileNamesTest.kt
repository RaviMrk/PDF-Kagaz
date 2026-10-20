package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FileNamesTest {
  @Test
  fun duplicateNameAddsCopySuffixBeforeExtension() {
    assertEquals("a (copy).pdf", FileNames.duplicateName("a.pdf") { false })
  }

  @Test
  fun duplicateNameNumbersWhenCopyIsTaken() {
    val taken = setOf("a (copy).pdf")
    assertEquals("a (copy 2).pdf", FileNames.duplicateName("a.pdf") { it in taken })
    val more = setOf("a (copy).pdf", "a (copy 2).pdf")
    assertEquals("a (copy 3).pdf", FileNames.duplicateName("a.pdf") { it in more })
  }

  @Test
  fun duplicateNameKeepsDevanagari() {
    assertEquals("अहवाल (copy).pdf", FileNames.duplicateName("अहवाल.pdf") { false })
  }

  @Test
  fun duplicateNameWithoutExtension() {
    assertEquals("noext (copy)", FileNames.duplicateName("noext") { false })
  }

  @Test
  fun uniqueNameReturnsNameWhenFree() {
    assertEquals("a.pdf", FileNames.uniqueName("a.pdf") { false })
  }

  @Test
  fun uniqueNameNumbersWhenTaken() {
    assertEquals("a (2).pdf", FileNames.uniqueName("a.pdf") { it == "a.pdf" })
    val taken = setOf("a.pdf", "a (2).pdf")
    assertEquals("a (3).pdf", FileNames.uniqueName("a.pdf") { it in taken })
  }

  @Test
  fun isValidNameRejectsSlashNulAndDots() {
    assertTrue(FileNames.isValidName("अहवाल 2.pdf"))
    assertFalse(FileNames.isValidName("a/b.pdf"))
    assertFalse(FileNames.isValidName("a\u0000.pdf"))
    assertFalse(FileNames.isValidName("  "))
    assertFalse(FileNames.isValidName(".."))
  }
}
