package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import com.tom_roush.pdfbox.util.Matrix
import kotlin.math.cos
import kotlin.math.sin

/** Writes recognized words as invisible text (render mode 3) so they can be searched and copied. */
object OcrTextLayer {
  /** The baseline sits this fraction of the font size above the bottom of the word box. */
  const val DESCENT_FRACTION = 0.2

  /**
   * Appends [words] to [page] in one content stream and returns how many were written: the font
   * size is the box height and the horizontal scaling stretches the word to the box width. Words
   * that are blank once encodable, or whose box or width is empty, are dropped.
   */
  fun addWords(doc: PDDocument, page: PDPage, words: List<Pair<String, Placement>>): Int {
    val font = PDType1Font.HELVETICA
    val ready = words.mapNotNull { (raw, at) ->
      val text = OcrText.encodable(raw)
      if (text.isBlank() || at.height <= 0 || at.width <= 0) return@mapNotNull null
      val natural = font.getStringWidth(text) / 1000.0 * at.height
      if (natural <= 0) null else Triple(text, at, natural)
    }
    if (ready.isEmpty()) return 0
    PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
      cs.saveGraphicsState()
      cs.beginText()
      cs.setRenderingMode(RenderingMode.NEITHER)
      for ((text, at, natural) in ready) {
        val t = Math.toRadians(at.rotate)
        val lift = DESCENT_FRACTION * at.height
        cs.setFont(font, at.height.toFloat())
        cs.setHorizontalScaling((100 * at.width / natural).toFloat())
        // The baseline origin: the box origin raised by [lift] along the text's own up direction.
        cs.setTextMatrix(Matrix.getRotateInstance(t, (at.x - lift * sin(t)).toFloat(), (at.y + lift * cos(t)).toFloat()))
        cs.showText(text)
      }
      cs.endText()
      cs.restoreGraphicsState()
    }
    return ready.size
  }
}
