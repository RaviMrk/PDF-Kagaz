package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.IOException

/** Tells scanned pages from pages that already carry text. */
object PageText {
  /** Fewer non-whitespace characters than this and a page counts as having no text. */
  const val MIN_TEXT_CHARS = 20

  /**
   * True when page [pageIndex] (0-based) has at least [MIN_TEXT_CHARS] non-whitespace characters.
   * A page whose text cannot be extracted counts as having none (so it gets OCR'd).
   */
  fun hasText(doc: PDDocument, pageIndex: Int): Boolean = hasText {
    PDFTextStripper().apply {
      startPage = pageIndex + 1
      endPage = pageIndex + 1
    }.getText(doc)
  }

  /** Test seam: [strip] extracts the page's text; a failure means no text, running out of memory stays an error. */
  internal fun hasText(strip: () -> String): Boolean =
    try {
      strip().count { !it.isWhitespace() } >= MIN_TEXT_CHARS
    } catch (e: IOException) {
      false
    } catch (e: RuntimeException) {
      false
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException()
    }
}
