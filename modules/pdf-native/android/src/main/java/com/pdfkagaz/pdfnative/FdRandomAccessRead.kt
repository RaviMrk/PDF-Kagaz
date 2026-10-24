package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.io.RandomAccessRead
import java.io.EOFException
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.FileChannel

/**
 * A PdfBox [RandomAccessRead] over a seekable [channel] (a descriptor the app already holds, e.g.
 * from a content provider), read with positional reads through an [bufferSize] buffer, so parsing
 * the xref, trailer and /Encrypt dictionary costs a few KB instead of a copy of the file. The
 * channel belongs to the caller: [close] only marks this reader closed (closing the channel would
 * close a descriptor a ParcelFileDescriptor still owns).
 */
internal class FdRandomAccessRead(
  private val channel: FileChannel,
  private val bufferSize: Int = DEFAULT_BUFFER,
) : RandomAccessRead {
  private val size = channel.size()
  private val buffer = ByteArray(bufferSize)
  private var bufferStart = 0L
  private var bufferLength = 0
  private var position = 0L
  private var closed = false

  private fun ensureOpen() {
    if (closed) throw IOException("closed")
  }

  /** Makes the buffer hold [position]; false at or past the end. */
  private fun fill(): Boolean {
    if (position >= size) return false
    if (position >= bufferStart && position < bufferStart + bufferLength) return true
    val bb = ByteBuffer.wrap(buffer)
    var read = 0
    while (read == 0) {
      read = channel.read(bb, position)
      if (read < 0) return false
    }
    bufferStart = position
    bufferLength = read
    return true
  }

  override fun read(): Int {
    ensureOpen()
    if (!fill()) return -1
    return buffer[(position++ - bufferStart).toInt()].toInt() and 0xff
  }

  override fun read(b: ByteArray): Int = read(b, 0, b.size)

  override fun read(b: ByteArray, off: Int, len: Int): Int {
    ensureOpen()
    if (len == 0) return 0
    var done = 0
    while (done < len && fill()) {
      val at = (position - bufferStart).toInt()
      val n = minOf(len - done, bufferLength - at)
      System.arraycopy(buffer, at, b, off + done, n)
      position += n
      done += n
    }
    return if (done == 0) -1 else done
  }

  override fun getPosition(): Long {
    ensureOpen()
    return position
  }

  override fun seek(position: Long) {
    ensureOpen()
    if (position < 0) throw IOException("negative position")
    this.position = position
  }

  override fun length(): Long {
    ensureOpen()
    return size
  }

  override fun isClosed(): Boolean = closed

  override fun peek(): Int {
    val value = read()
    if (value >= 0) position--
    return value
  }

  override fun rewind(bytes: Int) {
    ensureOpen()
    seek(position - bytes)
  }

  override fun readFully(length: Int): ByteArray {
    val out = ByteArray(length)
    var done = 0
    while (done < length) {
      val n = read(out, done, length - done)
      if (n < 0) throw EOFException()
      done += n
    }
    return out
  }

  override fun isEOF(): Boolean {
    ensureOpen()
    return position >= size
  }

  override fun available(): Int {
    ensureOpen()
    return minOf(maxOf(size - position, 0L), Int.MAX_VALUE.toLong()).toInt()
  }

  override fun close() {
    closed = true
  }

  companion object {
    const val DEFAULT_BUFFER = 8192

    /** Whether positional reads work on [channel] (a pipe-backed descriptor cannot seek). */
    fun isSeekable(channel: FileChannel): Boolean =
      try {
        val size = channel.size()
        size > 0 && channel.read(ByteBuffer.allocate(1), 0) == 1
      } catch (e: IOException) {
        false
      }
  }
}
