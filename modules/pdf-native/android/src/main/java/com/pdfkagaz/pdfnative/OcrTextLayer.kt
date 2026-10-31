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

  /** How far past its own box a word's trailing space may reach, in box heights (wrongly joined columns). */
  const val MAX_GAP_HEIGHTS = 3.0

  private class Ready(val text: String, val at: Placement)

  /**
   * Appends [lines] (each a text line's words in order) to [page] in one content stream and returns
   * how many words were written. The font size is the box height. Every word but the last of its
   * line is written followed by a space, stretched (horizontal scaling) to reach the next word, see
   * [span], so extractors see the space whatever the box padding; the last word is stretched to its
   * box. Words that are blank once encodable, or whose box is empty, are dropped.
   */
  fun addLines(doc: PDDocument, page: PDPage, lines: List<List<Pair<String, Placement>>>): Int {
    val font = PDType1Font.HELVETICA
    val ready = lines.map { line ->
      line.mapNotNull { (raw, at) ->
        val text = OcrText.encodable(raw).trim()
        if (text.isEmpty() || at.height <= 0 || at.width <= 0 || font.getStringWidth(text) <= 0) null else Ready(text, at)
      }
    }.filter { it.isNotEmpty() }
    if (ready.isEmpty()) return 0
    PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
      cs.saveGraphicsState()
      cs.beginText()
      cs.setRenderingMode(RenderingMode.NEITHER)
      for (line in ready) {
        for ((i, word) in line.withIndex()) {
          val at = word.at
          val next = line.getOrNull(i + 1)
          val text = if (next == null) word.text else word.text + " "
          val width = if (next == null) at.width else span(at, next.at)
          val natural = font.getStringWidth(text) / 1000.0 * at.height
          val t = Math.toRadians(at.rotate)
          val lift = DESCENT_FRACTION * at.height
          cs.setFont(font, at.height.toFloat())
          cs.setHorizontalScaling((100 * width / natural).toFloat())
          // The baseline origin: the box origin raised by [lift] along the text's own up direction.
          cs.setTextMatrix(Matrix.getRotateInstance(t, (at.x - lift * sin(t)).toFloat(), (at.y + lift * cos(t)).toFloat()))
          cs.showText(text)
        }
      }
      cs.endText()
      cs.restoreGraphicsState()
    }
    return ready.sumOf { it.size }
  }

  /**
   * The width a word at [at] and its trailing space take up when [next] follows on the same line:
   * the advance to [next]'s origin along the text direction, at least the word's own box and at
   * most [MAX_GAP_HEIGHTS] box heights past it.
   */
  internal fun span(at: Placement, next: Placement): Double {
    val t = Math.toRadians(at.rotate)
    val advance = (next.x - at.x) * cos(t) + (next.y - at.y) * sin(t)
    return advance.coerceIn(at.width, at.width + MAX_GAP_HEIGHTS * at.height)
  }
}
