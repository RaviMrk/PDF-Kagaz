package com.pdfkagaz.pdfnative

import java.io.File
import java.io.RandomAccessFile

/**
 * Tells a PDF cut short (an interrupted download or copy) from one that merely has junk after
 * `%%EOF` or no `%%EOF` at all, which pdfium and pdf-lib open and so must PdfBox. Only a file
 * with no `%%EOF` in its last [TAIL_BYTES] that ends inside an object (an unclosed `stream` or
 * `obj`) counts as truncated. One bounded read; IOException propagates (the caller maps it).
 */
internal object PdfTruncation {
  const val TAIL_BYTES = 1_048_576

  private val STREAM = Regex("(?<!end)stream")
  private val OBJ = Regex("\\d+\\s+\\d+\\s+obj\\b")

  fun isTruncated(file: File): Boolean = isTruncatedTail(readTail(file))

  /** [tail] is the end of the file, decoded byte for byte (ISO-8859-1). */
  fun isTruncatedTail(tail: String): Boolean {
    if (tail.contains("%%EOF")) return false
    val lastStream = STREAM.findAll(tail).lastOrNull()?.range?.first ?: -1
    val lastObj = OBJ.findAll(tail).lastOrNull()?.range?.first ?: -1
    return lastStream > tail.lastIndexOf("endstream") || lastObj > tail.lastIndexOf("endobj")
  }

  private fun readTail(file: File): String =
    RandomAccessFile(file, "r").use { raf ->
      val length = raf.length()
      val size = minOf(length, TAIL_BYTES.toLong()).toInt()
      val tail = ByteArray(size)
      raf.seek(length - size)
      raf.readFully(tail)
      String(tail, Charsets.ISO_8859_1)
    }
}
