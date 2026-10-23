package com.pdfkagaz.pdfnative

import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/** Copies a stream into a file through its hidden part sibling (pure java.io; JVM-testable). */
object SessionCopy {
  /**
   * Writes what [open] returns to [target] through `.<name>.part` with [copy], then renames it into
   * place; the part file never survives. Returns the copied byte count. Only opening the source
   * maps FileNotFoundException to ERR_FILE_NOT_FOUND; a part file that cannot be created (or any
   * other write failure) is ERR_IO.
   */
  fun intoFile(target: File, open: () -> InputStream, copy: (InputStream, OutputStream) -> Long): Long {
    val input = try {
      open()
    } catch (e: FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    }
    val part = File(target.parentFile, ToolPaths.partName(target.name))
    try {
      val size = input.use { FileOutputStream(part).use { output -> copy(input, output) } }
      if (!part.renameTo(target)) throw IoCodedException()
      return size
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      if (part.exists()) part.delete()
    }
  }
}
