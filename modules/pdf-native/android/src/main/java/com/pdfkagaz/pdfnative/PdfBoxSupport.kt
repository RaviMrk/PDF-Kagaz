package com.pdfkagaz.pdfnative

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Opening and saving PDFs with PdfBox-Android. Every document is opened with mixed memory
 * ([MAIN_MEMORY_BYTES] on the heap, then temp files in the caller's job workspace) and every
 * failure becomes a coded error without a file name or path. Disk work: call on Dispatchers.IO.
 */
object PdfBoxSupport {
  const val MAIN_MEMORY_BYTES = 16_777_216L

  private val initialized = AtomicBoolean(false)

  /** Gives PdfBox the app's assets (fonts, CMaps); once per process, from the module's OnCreate. */
  fun init(context: Context) {
    if (initialized.compareAndSet(false, true)) PDFBoxResourceLoader.init(context.applicationContext)
  }

  /**
   * Opens [file]; a null [password] tries the empty user password. Encrypted and no password →
   * ERR_PDF_ENCRYPTED; a password that does not open it → ERR_PASSWORD_WRONG; damaged or unreadable
   * → ERR_PDF_INVALID; out of memory → ERR_TOO_LARGE. The caller closes the document.
   */
  fun open(file: File, password: String?, tempDir: File): PDDocument {
    try {
      // PdfBox's lenient parser rebuilds a truncated file from whatever objects survive; a file
      // cut short (no %%EOF near its end) is refused instead, like Acrobat does.
      if (!hasEofMarker(file)) throw PdfInvalidException()
      tempDir.mkdirs()
      val memory = MemoryUsageSetting.setupMixed(MAIN_MEMORY_BYTES).setTempDir(tempDir)
      return PDDocument.load(file, password ?: "", memory)
    } catch (e: InvalidPasswordException) {
      throw if (password == null) PdfEncryptedException(cause = e) else PasswordWrongException(cause = e)
    } catch (e: IOException) {
      throw PdfInvalidException(cause = e)
    } catch (e: OutOfMemoryError) {
      throw TooLargeException(cause = e)
    }
  }

  /** True when `%%EOF` occurs in the last [EOF_LOOKUP_BYTES] bytes of [file]. */
  private fun hasEofMarker(file: File): Boolean =
    RandomAccessFile(file, "r").use { raf ->
      val length = raf.length()
      val size = minOf(length, EOF_LOOKUP_BYTES.toLong()).toInt()
      val tail = ByteArray(size)
      raf.seek(length - size)
      raf.readFully(tail)
      String(tail, Charsets.ISO_8859_1).contains("%%EOF")
    }

  private const val EOF_LOOKUP_BYTES = 1024

  /**
   * Saves [doc] to `<target>.part`, then renames it over [target], so [target] never holds a
   * half-written file. The part file is removed on failure (ERR_IO, or ERR_TOO_LARGE when out of memory).
   */
  fun saveTo(doc: PDDocument, target: File) {
    val part = File(target.parentFile, target.name + ".part")
    var done = false
    try {
      doc.save(part)
      if (!part.renameTo(target)) throw IoCodedException()
      done = true
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } catch (e: OutOfMemoryError) {
      throw TooLargeException(cause = e)
    } finally {
      if (!done) part.delete()
    }
  }
}
