package com.pdfkagaz.pdfnative

import java.io.File

/** What [PdfOcr.run] did: pages seen, OCR'd, given text, skipped (already text) and words written. */
data class OcrStats(
  val pageCount: Int,
  val pagesRecognized: Int,
  val pagesWithText: Int,
  val pagesSkipped: Int,
  val wordsAdded: Int,
)

/**
 * Make searchable (T-13): adds an invisible text layer to the pages without text, from what a
 * [PageRecognizer] finds on them. Pages that already have text are skipped. Never logs or throws
 * recognized text. Disk work: call on Dispatchers.IO.
 */
object PdfOcr {
  /**
   * Writes [source] with the text layer to [target] (through a part file), only when at least one
   * word was added; otherwise [target] is not written. [control] is checked before and after each
   * page's recognition; progress is one unit per page plus one for the save. Encrypted input →
   * ERR_PDF_ENCRYPTED; a cancel or failure leaves no [target].
   */
  fun run(source: File, target: File, recognizer: PageRecognizer, control: JobControl, tempDir: File): OcrStats {
    control.check()
    PdfBoxSupport.open(source, null, tempDir).use { doc ->
      if (doc.isEncrypted) throw PdfEncryptedException()
      val pageCount = doc.numberOfPages
      var recognized = 0
      var withText = 0
      var skipped = 0
      var added = 0
      for (i in 0 until pageCount) {
        control.check()
        if (PageText.hasText(doc, i)) {
          skipped += 1
        } else {
          val result = recognizer.recognize(i)
          control.check()
          recognized += 1
          val n = PdfBoxSupport.mapReadErrors {
            val page = doc.getPage(i)
            val box = PdfStamper.boxOf(page)
            val placed = result.words.mapNotNull { w ->
              OcrGeometry.wordPlacement(box, result.widthPx, result.heightPx, w)?.let { w.text to it }
            }
            OcrTextLayer.addWords(doc, page, placed)
          }
          if (n > 0) withText += 1
          added += n
        }
        control.progress((i + 1) / (pageCount + 1.0))
      }
      if (added > 0) {
        control.check()
        PdfBoxSupport.saveTo(doc, target)
      }
      control.progress(1.0)
      return OcrStats(pageCount, recognized, withText, skipped, added)
    }
  }
}
