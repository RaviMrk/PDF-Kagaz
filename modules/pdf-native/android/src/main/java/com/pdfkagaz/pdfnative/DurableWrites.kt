package com.pdfkagaz.pdfnative

import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileDescriptor
import java.io.FileOutputStream
import java.io.FilterOutputStream
import java.io.OutputStream
import java.io.SyncFailedException

/**
 * Writes that reach the disk before the output becomes visible (rename, IS_PENDING = 0): the bytes
 * are flushed and fsynced while the descriptor is still open, so a crash or power loss right after
 * publishing never leaves an empty or partial file under the published name. Blocking.
 */
object DurableWrites {
  private const val BUFFER_BYTES = 64 * 1024

  internal val DEFAULT_SYNC: (FileDescriptor) -> Unit = { it.sync() }

  /** The fsync; tests swap it to observe when it runs. */
  @Volatile
  internal var sync: (FileDescriptor) -> Unit = DEFAULT_SYNC

  /**
   * Creates or truncates [file], lets [block] write into it, then flushes and fsyncs before closing.
   * [block] may close the stream it gets (PdfBox does): that only flushes.
   */
  fun <T> writeFile(file: File, block: (OutputStream) -> T): T =
    FileOutputStream(file).use { out ->
      val result = writeThenFlush(out, block)
      sync(out.fd)
      result
    }

  /**
   * Writes through [pfd] (closed afterwards), then flushes and fsyncs before closing. A provider
   * descriptor that cannot be synced (a pipe or socket) fails the write when [requireSync], else
   * the write stands without a sync (best effort for document providers).
   */
  fun <T> writeFd(pfd: ParcelFileDescriptor, requireSync: Boolean, block: (OutputStream) -> T): T =
    ParcelFileDescriptor.AutoCloseOutputStream(pfd).use { out ->
      val result = writeThenFlush(out, block)
      try {
        sync(pfd.fileDescriptor)
      } catch (e: SyncFailedException) {
        if (requireSync) throw e
      }
      result
    }

  /** Best-effort fsync of [dir], so a rename into it is durable too; ignored where unsupported. */
  fun syncDir(dir: File) {
    try {
      val fd = Os.open(dir.path, OsConstants.O_RDONLY, 0)
      try {
        Os.fsync(fd)
      } finally {
        Os.close(fd)
      }
    } catch (_: Exception) {
      // FUSE shared storage or a provider may refuse a directory sync; the file itself is synced.
    }
  }

  private fun <T> writeThenFlush(out: OutputStream, block: (OutputStream) -> T): T {
    val buffered = BufferedOutputStream(FlushOnClose(out), BUFFER_BYTES)
    val result = block(buffered)
    buffered.flush()
    return result
  }

  /** Closing only flushes: the descriptor must stay open for the sync. */
  private class FlushOnClose(out: OutputStream) : FilterOutputStream(out) {
    override fun write(b: ByteArray, off: Int, len: Int) {
      out.write(b, off, len)
    }

    override fun close() {
      out.flush()
    }
  }
}
