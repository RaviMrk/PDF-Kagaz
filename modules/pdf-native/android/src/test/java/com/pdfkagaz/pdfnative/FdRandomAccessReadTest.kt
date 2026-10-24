package com.pdfkagaz.pdfnative

import java.io.EOFException
import java.io.File
import java.io.RandomAccessFile
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FdRandomAccessReadTest {
  @get:Rule
  val tmp = TemporaryFolder()

  /** 100 bytes, byte i = i, read through a 16-byte buffer so reads cross buffer boundaries. */
  private fun reader(): Pair<FdRandomAccessRead, RandomAccessFile> {
    val file = tmp.newFile()
    file.writeBytes(ByteArray(100) { it.toByte() })
    val raf = RandomAccessFile(file, "r")
    return FdRandomAccessRead(raf.channel, bufferSize = 16) to raf
  }

  @Test
  fun readsAtTheStartMiddleAndEnd() {
    val (r, raf) = reader()
    raf.use {
      assertEquals(100L, r.length())
      assertEquals(0, r.read())
      r.seek(50)
      assertEquals(50L, r.position)
      assertEquals(50, r.read())
      r.seek(99)
      assertEquals(99, r.read())
      assertEquals(-1, r.read())
      assertTrue(r.isEOF)
    }
  }

  @Test
  fun readsAcrossTheBufferBoundary() {
    val (r, raf) = reader()
    raf.use {
      r.seek(10)
      val out = ByteArray(40)
      assertEquals(40, r.read(out, 0, 40))
      assertArrayEquals(ByteArray(40) { (it + 10).toByte() }, out)
      assertEquals(50L, r.position)
      assertArrayEquals(ByteArray(20) { (it + 50).toByte() }, r.readFully(20))
    }
  }

  @Test
  fun aShortReadAtTheEndAndEof() {
    val (r, raf) = reader()
    raf.use {
      r.seek(95)
      val out = ByteArray(20)
      assertEquals(5, r.read(out, 0, 20))
      assertEquals(-1, r.read(out, 0, 20))
      assertEquals(0, r.available())
      r.seek(90)
      try {
        r.readFully(20)
        fail("expected EOF")
      } catch (e: EOFException) {
        // expected
      }
    }
  }

  @Test
  fun peekAndRewindDoNotMoveTheReader() {
    val (r, raf) = reader()
    raf.use {
      r.seek(20)
      assertEquals(20, r.peek())
      assertEquals(20L, r.position)
      assertEquals(20, r.read())
      r.rewind(5)
      assertEquals(16L, r.position)
      assertEquals(16, r.read())
      assertEquals(83, r.available())
    }
  }

  @Test
  fun closeLeavesTheChannelOpen() {
    val (r, raf) = reader()
    raf.use {
      r.close()
      assertTrue(r.isClosed)
      assertTrue(raf.channel.isOpen)
      try {
        r.read()
        fail("expected closed")
      } catch (e: java.io.IOException) {
        // expected
      }
    }
  }

  @Test
  fun seekabilityIsProbedByAPositionalRead() {
    val (_, raf) = reader()
    assertTrue(FdRandomAccessRead.isSeekable(raf.channel))
    raf.close()
    assertFalse(FdRandomAccessRead.isSeekable(raf.channel))
    val empty = tmp.newFile()
    RandomAccessFile(empty, "r").use { assertFalse(FdRandomAccessRead.isSeekable(it.channel)) }
  }
}
