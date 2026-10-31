package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
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
            val placed = result.lines.map { line ->
              line.mapNotNull { w -> OcrGeometry.wordPlacement(box, result.widthPx, result.heightPx, w)?.let { w.text to it } }
            }
            OcrTextLayer.addLines(doc, page, placed)
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

/**
 * [PdfOcr.run] for job [jobId]: [fileUri] must be a file of that job's workspace (anything else →
 * ERR_PERMISSION_DENIED); the output (`out-ocr.pdf`) and PdfBox scratch files go into the same
 * workspace. Returns `{ uri (null when no word was added), sizeBytes, pageCount, pagesRecognized,
 * pagesWithText, pagesSkipped, wordsAdded }`.
 */
fun PdfOcr.ocrInWorkspace(context: Context, jobId: String, fileUri: String, control: JobControl): Map<String, Any?> =
  ocrInWorkspace(context, jobId, fileUri, control) { source -> MlKitPageRecognizer(context, source) }

/**
 * Test seam: [recognizerFor] makes the recognizer for the workspace file, only once the first page
 * without text needs it (an all-text PDF never loads the model); it is closed afterwards when made
 * and closeable.
 */
internal fun PdfOcr.ocrInWorkspace(
  context: Context,
  jobId: String,
  fileUri: String,
  control: JobControl,
  recognizerFor: (File) -> PageRecognizer,
): Map<String, Any?> {
  if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
  val source = ToolFiles.workspaceFile(context, Uri.parse(fileUri))
  val dir = source.parentFile ?: throw PermissionDeniedException()
  if (dir.name != jobId) throw PermissionDeniedException()
  if (!source.isFile) throw FileNotFoundCodedException()
  val target = File(dir, "out-ocr.pdf")
  val tempDir = File(dir, "pdfbox-ocr")
  var made: PageRecognizer? = null
  val recognizer = PageRecognizer { i -> (made ?: recognizerFor(source).also { made = it }).recognize(i) }
  try {
    val stats = run(source, target, recognizer, control, tempDir)
    val written = stats.wordsAdded > 0 && target.isFile
    return mapOf(
      "uri" to if (written) Uri.fromFile(target).toString() else null,
      "sizeBytes" to if (written) target.length() else 0L,
      "pageCount" to stats.pageCount,
      "pagesRecognized" to stats.pagesRecognized,
      "pagesWithText" to stats.pagesWithText,
      "pagesSkipped" to stats.pagesSkipped,
      "wordsAdded" to stats.wordsAdded,
    )
  } finally {
    try {
      (made as? AutoCloseable)?.close()
    } finally {
      tempDir.deleteRecursively()
    }
  }
}
