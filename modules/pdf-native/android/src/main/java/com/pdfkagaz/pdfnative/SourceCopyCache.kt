package com.pdfkagaz.pdfnative

import java.io.File
import java.io.InputStream

/**
 * One scratch copy of a source that cannot be read in place (a non-seekable descriptor), kept for
 * [ttlMs] so the password checks of one prompt do not copy again. A different [key], expiry or
 * [clear] deletes it. Disk work: call on Dispatchers.IO.
 */
internal class SourceCopyCache(
  private val dir: File,
  private val ttlMs: Long = 120_000L,
  private val now: () -> Long = System::currentTimeMillis,
) {
  private var key: String? = null
  private var file: File? = null
  private var madeAt = 0L

  @Synchronized
  fun get(key: String, open: () -> InputStream): File {
    val held = file
    if (held != null && this.key == key && held.isFile && now() - madeAt < ttlMs) return held
    clear()
    dir.mkdirs()
    val copy = File(dir, "source-${now()}.pdf")
    try {
      open().use { input -> copy.outputStream().use { input.copyTo(it) } }
    } catch (e: Throwable) {
      copy.delete()
      throw e
    }
    this.key = key
    file = copy
    madeAt = now()
    return copy
  }

  @Synchronized
  fun clear() {
    file?.delete()
    file = null
    key = null
  }
}
