package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import org.junit.Assert.assertEquals
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
    val written = OcrTextLayer.addWords(
      doc,
      page,
      listOf(
        "Invoice" to Placement(50.0, 672.0, 100.0, 20.0, 0.0),
        "Total" to Placement(50.0, 600.0, 60.0, 20.0, 0.0),
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
    assertEquals(1, OcrTextLayer.addWords(doc, page, listOf("Rotated" to at)))
    reload(doc).use { back -> assertTrue(PDFTextStripper().getText(back).contains("Rotated")) }
    doc.close()
  }

  @Test
  fun blankWordsAreNotWritten() {
    val doc = PDDocument()
    val page = PDPage(PDRectangle.LETTER)
    doc.addPage(page)
    val at = Placement(50.0, 672.0, 100.0, 20.0, 0.0)
    assertEquals(1, OcrTextLayer.addWords(doc, page, listOf("  " to at, "Word" to at, "" to at)))
    assertEquals(0, OcrTextLayer.addWords(doc, page, listOf("  " to at)))
    doc.close()
  }
}
