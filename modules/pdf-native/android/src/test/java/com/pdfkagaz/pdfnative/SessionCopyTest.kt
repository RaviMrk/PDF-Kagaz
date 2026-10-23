package com.pdfkagaz.pdfnative

import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream
import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SessionCopyTest {
  private val dir: File = Files.createTempDirectory("session-copy").toFile()
  private val copy = { input: InputStream, output: java.io.OutputStream -> input.copyTo(output) }

  private fun codeOf(block: () -> Unit): String {
    try {
      block()
    } catch (e: expo.modules.kotlin.exception.CodedException) {
      return e.code
    }
    fail("expected a coded exception")
    return ""
  }

  @Test
  fun copiesThroughAPartFileIntoTheTarget() {
    val target = File(dir, "src-0")
    val size = SessionCopy.intoFile(target, { ByteArrayInputStream(byteArrayOf(1, 2, 3)) }, copy)
    assertEquals(3L, size)
    assertArrayEquals(byteArrayOf(1, 2, 3), target.readBytes())
    assertFalse(File(dir, ".src-0.part").exists())
  }

  @Test
  fun aSourceThatCannotBeFoundIsFileNotFound() {
    val code = codeOf {
      SessionCopy.intoFile(File(dir, "src-1"), { throw FileNotFoundException("gone") }, copy)
    }
    assertEquals("ERR_FILE_NOT_FOUND", code)
  }

  @Test
  fun aPartFileThatCannotBeCreatedIsIoNotFileNotFound() {
    // The session folder is a plain file: FileOutputStream on the part throws FileNotFoundException.
    val blocker = File(dir, "img-x").apply { writeText("not a folder") }
    var closed = false
    val source = object : ByteArrayInputStream(byteArrayOf(1)) {
      override fun close() {
        closed = true
        super.close()
      }
    }
    val code = codeOf { SessionCopy.intoFile(File(blocker, "src-0"), { source }, copy) }
    assertEquals("ERR_IO", code)
    assertTrue("the source stream is closed", closed)
  }
}
