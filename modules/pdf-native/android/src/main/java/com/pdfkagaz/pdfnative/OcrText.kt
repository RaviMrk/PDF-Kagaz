package com.pdfkagaz.pdfnative

import java.text.Normalizer

/** One recognized word: its box in bitmap pixels, y down. */
data class OcrWord(val text: String, val left: Int, val top: Int, val right: Int, val bottom: Int)

/** What a recognizer found on a page rendered at [widthPx] x [heightPx] pixels. */
data class RecognizedPage(val widthPx: Int, val heightPx: Int, val words: List<OcrWord>)

/** Recognizes the page at [pageIndex] (0-based); implemented by the ML Kit recognizer. */
fun interface PageRecognizer {
  fun recognize(pageIndex: Int): RecognizedPage
}

/** Makes recognized text fit the invisible layer's font (Helvetica, WinAnsiEncoding). */
object OcrText {
  /**
   * [text] NFC-normalised; each character outside WinAnsi becomes its NFD base letter when that is
   * WinAnsi, else `?`; other spaces (no-break, ideographic ...) become a plain space.
   */
  fun encodable(text: String): String {
    val out = StringBuilder()
    val nfc = Normalizer.normalize(text, Normalizer.Form.NFC)
    var i = 0
    while (i < nfc.length) {
      val c = nfc.codePointAt(i)
      i += Character.charCount(c)
      val s = String(Character.toChars(c))
      if (PdfStamper.isWinAnsi(s)) {
        out.append(s)
        continue
      }
      val base = Normalizer.normalize(s, Normalizer.Form.NFD).let { it.substring(0, Character.charCount(it.codePointAt(0))) }
      when {
        PdfStamper.isWinAnsi(base) -> out.append(base)
        Character.isSpaceChar(c) || Character.isWhitespace(c) -> out.append(' ')
        else -> out.append('?')
      }
    }
    return out.toString()
  }
}
