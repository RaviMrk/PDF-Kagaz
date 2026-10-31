package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper

/** Tells scanned pages from pages that already carry text. */
object PageText {
  /** Fewer non-whitespace characters than this and a page counts as having no text. */
  const val MIN_TEXT_CHARS = 20

  /** True when page [pageIndex] (0-based) has at least [MIN_TEXT_CHARS] non-whitespace characters. */
  fun hasText(doc: PDDocument, pageIndex: Int): Boolean = PdfBoxSupport.mapReadErrors {
    val stripper = PDFTextStripper().apply {
      startPage = pageIndex + 1
      endPage = pageIndex + 1
    }
    stripper.getText(doc).count { !it.isWhitespace() } >= MIN_TEXT_CHARS
  }
}
