package com.pdfkagaz.pdfnative

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.io.ScratchFile
import com.tom_roush.pdfbox.pdfparser.PDFParser
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.IOException
import java.nio.channels.FileChannel
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Opening and saving PDFs with PdfBox-Android. Every document is opened with mixed memory
 * ([MAIN_MEMORY_BYTES] on the heap, then temp files in the caller's job workspace). Every failure
 * becomes a coded error with a fixed message and no cause, so no file name or path travels with it
 * (PdfBox and java.io put paths into their messages). Disk work: call on Dispatchers.IO.
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
   * ERR_PDF_ENCRYPTED; a password that does not open it → ERR_PASSWORD_WRONG; truncated, damaged
   * or unreadable → ERR_PDF_INVALID; out of memory → ERR_OUT_OF_MEMORY. The caller closes the document.
   */
  fun open(file: File, password: String?, tempDir: File): PDDocument = mapOpenErrors(password) {
    // PdfBox's lenient parser rebuilds a file cut short from whatever objects survive.
    if (PdfTruncation.isTruncated(file)) throw PdfInvalidException()
    tempDir.mkdirs()
    val memory = MemoryUsageSetting.setupMixed(MAIN_MEMORY_BYTES).setTempDir(tempDir)
    PDDocument.load(file, password ?: "", memory)
  }

  /**
   * [open] on a seekable [channel] the caller owns (a provider descriptor), read in place with no
   * copy; the same error mapping. Closing the document does not close [channel].
   */
  fun openChannel(channel: FileChannel, password: String?, tempDir: File): PDDocument = mapOpenErrors(password) {
    val source = FdRandomAccessRead(channel)
    tempDir.mkdirs()
    var scratch: ScratchFile? = null
    var ok = false
    try {
      if (PdfTruncation.isTruncated(source)) throw PdfInvalidException()
      val memory = MemoryUsageSetting.setupMixed(MAIN_MEMORY_BYTES).setTempDir(tempDir)
      scratch = ScratchFile(memory)
      val parser = PDFParser(source, password ?: "", scratch)
      parser.parse()
      parser.pdDocument.also { ok = true }
    } finally {
      if (!ok) {
        runCatching { scratch?.close() }
        source.close()
      }
    }
  }

  /**
   * Saves [doc] to `<target>.part` (flushed and fsynced, [DurableWrites]), then renames it over
   * [target], so [target] never holds a half-written file, even after a crash. The part file is removed on failure (ERR_IO, or ERR_OUT_OF_MEMORY when out of memory).
   */
  fun saveTo(doc: PDDocument, target: File) {
    val part = File(target.parentFile, target.name + ".part")
    var done = false
    try {
      mapSaveErrors {
        DurableWrites.writeFile(part) { out -> doc.save(out) }
        if (!part.renameTo(target)) throw IoCodedException()
      }
      done = true
    } finally {
      if (!done) part.delete()
    }
  }

  /** The error mapping of [open]; coded errors pass through, causes are dropped. */
  internal fun <T> mapOpenErrors(password: String?, block: () -> T): T =
    try {
      block()
    } catch (e: CodedException) {
      throw e
    } catch (e: InvalidPasswordException) {
      throw if (password == null) PdfEncryptedException() else PasswordWrongException()
    } catch (e: IOException) {
      throw PdfInvalidException()
    } catch (e: RuntimeException) {
      // PdfBox 2.0 throws IllegalArgumentException, ClassCastException, NPE… on malformed input.
      throw PdfInvalidException()
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException()
    }

  /**
   * The error mapping of work that reads (and decodes) an open document: a failure there is a
   * damaged input (ERR_PDF_INVALID), out of memory ERR_OUT_OF_MEMORY; coded errors pass through.
   */
  internal fun <T> mapReadErrors(block: () -> T): T =
    try {
      block()
    } catch (e: CodedException) {
      throw e
    } catch (e: IOException) {
      throw PdfInvalidException()
    } catch (e: RuntimeException) {
      throw PdfInvalidException()
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException()
    }

  /** The error mapping of [saveTo]; coded errors pass through, causes are dropped. */
  internal fun <T> mapSaveErrors(block: () -> T): T =
    try {
      block()
    } catch (e: CodedException) {
      throw e
    } catch (e: IOException) {
      throw IoCodedException()
    } catch (e: RuntimeException) {
      throw IoCodedException()
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException()
    }
}
