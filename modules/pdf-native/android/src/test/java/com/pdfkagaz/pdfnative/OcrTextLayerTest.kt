package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OcrTextLayerTest {
  @get:Rule
  val tmp = TemporaryFolder()

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
  }

  private fun reload(doc: PDDocument): PDDocument {
    val file = File(tmp.root, "out-${System.nanoTime()}.pdf")
    doc.save(file)
    return PDDocument.load(file)
  }

  @Test
  fun writesInvisibleSearchableWords() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    doc.addPage(page)
    val written = OcrTextLayer.addLines(
      doc,
      page,
      listOf(
        listOf("Invoice" to Placement(50.0, 672.0, 100.0, 20.0, 0.0)),
        listOf("Total" to Placement(50.0, 600.0, 60.0, 20.0, 0.0)),
      ),
    )
    assertEquals(2, written)
    reload(doc).use { back ->
      val text = PDFTextStripper().getText(back)
      assertTrue(text.contains("Invoice"))
      assertTrue(text.indexOf("Invoice") < text.indexOf("Total"))
      val content = String(back.getPage(0).contents.readBytes(), Charsets.ISO_8859_1)
      assertTrue(content.contains("3 Tr"))
    }
    doc.close()
  }

  @Test
  fun rotatedPageExtracts() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    page.rotation = 90
    doc.addPage(page)
    val box = PdfStamper.boxOf(page)
    val at = OcrGeometry.wordPlacement(box, 1584, 1224, OcrWord("Rotated", 100, 200, 300, 240))!!
    assertEquals(1, OcrTextLayer.addLines(doc, page, listOf(listOf("Rotated" to at))))
    reload(doc).use { back -> assertTrue(PDFTextStripper().getText(back).contains("Rotated")) }
    doc.close()
  }

  @Test
  fun blankWordsAreNotWritten() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    doc.addPage(page)
    val at = Placement(50.0, 672.0, 100.0, 20.0, 0.0)
    assertEquals(1, OcrTextLayer.addLines(doc, page, listOf(listOf("  " to at, "Word" to at, "" to at))))
    assertEquals(0, OcrTextLayer.addLines(doc, page, listOf(listOf("  " to at), emptyList())))
    doc.close()
  }

  @Test
  fun touchingWordsKeepTheirSpace() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    doc.addPage(page)
    val line = listOf("Total" to Placement(50.0, 600.0, 60.0, 20.0, 0.0), "due" to Placement(110.0, 600.0, 40.0, 20.0, 0.0))
    assertEquals(2, OcrTextLayer.addLines(doc, page, listOf(line)))
    reload(doc).use { back -> assertTrue(PDFTextStripper().getText(back).contains("Total due")) }
    doc.close()
  }

  @Test
  fun touchingWordsKeepTheirSpaceOnARotatedPage() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    page.rotation = 90
    doc.addPage(page)
    val box = PdfStamper.boxOf(page)
    val line = listOf(OcrWord("Total", 100, 200, 220, 240), OcrWord("due", 220, 200, 300, 240)).map { w ->
      w.text to OcrGeometry.wordPlacement(box, 1584, 1224, w)!!
    }
    assertEquals(2, OcrTextLayer.addLines(doc, page, listOf(line)))
    reload(doc).use { back -> assertTrue(PDFTextStripper().getText(back).contains("Total due")) }
    doc.close()
  }

  @Test
  fun separateLinesAreNotJoined() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    doc.addPage(page)
    val lines = listOf(
      listOf("Total" to Placement(50.0, 600.0, 60.0, 20.0, 0.0)),
      listOf("due" to Placement(50.0, 560.0, 40.0, 20.0, 0.0)),
    )
    assertEquals(2, OcrTextLayer.addLines(doc, page, lines))
    reload(doc).use { back ->
      val text = PDFTextStripper().getText(back)
      assertFalse(text.contains("Total due"))
      assertTrue(text.indexOf("Total") >= 0 && text.indexOf("Total") < text.indexOf("due"))
    }
    doc.close()
  }

  @Test
  fun spanReachesTheNextWordWithinLimits() {
    val at = Placement(50.0, 600.0, 60.0, 20.0, 0.0)
    // Touching or overlapping boxes: the word's own width.
    assertEquals(60.0, OcrTextLayer.span(at, Placement(110.0, 600.0, 40.0, 20.0, 0.0)), 1e-9)
    assertEquals(60.0, OcrTextLayer.span(at, Placement(100.0, 600.0, 40.0, 20.0, 0.0)), 1e-9)
    // A normal gap: up to the next origin.
    assertEquals(75.0, OcrTextLayer.span(at, Placement(125.0, 600.0, 40.0, 20.0, 0.0)), 1e-9)
    // A column jump: capped at three box heights past the box.
    assertEquals(120.0, OcrTextLayer.span(at, Placement(400.0, 600.0, 40.0, 20.0, 0.0)), 1e-9)
    // Rotated 90: the advance is along +y.
    val up = Placement(300.0, 100.0, 60.0, 20.0, 90.0)
    assertEquals(75.0, OcrTextLayer.span(up, Placement(300.0, 175.0, 40.0, 20.0, 90.0)), 1e-9)
  }
}
