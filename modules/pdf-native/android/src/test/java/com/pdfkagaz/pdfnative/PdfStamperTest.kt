package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.contentstream.operator.Operator
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSNumber
import com.tom_roush.pdfbox.pdfparser.PDFStreamParser
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PdfStamperTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var jobDir: File
  private lateinit var tempDir: File
  private lateinit var target: File
  private lateinit var pngUri: String

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    jobDir = tmp.newFolder("job")
    tempDir = File(jobDir, "pdfbox-stamp")
    target = File(jobDir, "out-stamped.pdf")
    val png = File(jobDir, "stamp.png")
    Fixtures.file("images/alpha-200x100.png").copyTo(png)
    pngUri = "file://${png.path}"
  }

  private fun imageStamp(pages: List<Int>? = null, angle: Double = 45.0, opacity: Double = 0.35, png: String = pngUri) =
    JSONObject()
      .put("kind", "image")
      .put("png", png)
      .put("pages", pages?.let { JSONArray(it) } ?: JSONObject.NULL)
      .put("anchor", JSONObject().put("position", "center").put("marginPt", 24))
      .put("widthFrac", 0.5)
      .put("angle", angle)
      .put("opacity", opacity)

  private fun textStamp(template: String = "Page {n} of {total}", start: Int = 1, pages: List<Int>? = null) =
    JSONObject()
      .put("kind", "text")
      .put("template", template)
      .put("start", start)
      .put("pages", pages?.let { JSONArray(it) } ?: JSONObject.NULL)
      .put("position", "bottom-center")
      .put("fontSize", 12)
      .put("marginPt", 28)

  private fun spec(vararg stamps: JSONObject) = JSONObject().put("stamps", JSONArray(stamps.toList())).toString()

  private fun stamp(source: String, specJson: String, control: JobControl = JobControl({}, { 0L })) =
    PdfStamper.stamp(Fixtures.file(source), target, specJson, control, tempDir)

  private fun codeOf(block: () -> Unit): String =
    try {
      block()
      fail("Expected a coded error")
      throw AssertionError()
    } catch (e: CodedException) {
      e.code
    }

  private data class Drawn(val image: PDImageXObject, val ctm: DoubleArray)

  /** The image XObjects a page draws, each with the CTM at its `Do` (q/Q/cm tracked). */
  private fun drawnImages(page: PDPage): List<Drawn> {
    val tokens = PDFStreamParser(page).apply { parse() }.tokens
    var ctm = doubleArrayOf(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    val stack = ArrayList<DoubleArray>()
    val operands = ArrayList<Any>()
    val found = ArrayList<Drawn>()
    for (token in tokens) {
      if (token !is Operator) {
        operands += token
        continue
      }
      when (token.name) {
        "q" -> stack += ctm
        "Q" -> ctm = stack.removeAt(stack.size - 1)
        "cm" -> {
          val m = operands.takeLast(6).map { (it as COSNumber).floatValue().toDouble() }
          val n = ctm
          ctm = doubleArrayOf(
            m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
            m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
            m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
          )
        }
        "Do" -> {
          val x = page.resources.getXObject(operands.last() as COSName)
          if (x is PDImageXObject) found += Drawn(x, ctm)
        }
      }
      operands.clear()
    }
    return found
  }

  private fun opacities(page: PDPage): List<Float> =
    page.resources.extGStateNames.mapNotNull { page.resources.getExtGState(it)?.nonStrokingAlphaConstant }

  private fun textOf(doc: PDDocument, page: Int): String =
    PDFTextStripper().apply {
      startPage = page
      endPage = page
    }.getText(doc)

  @Test
  fun stampsAnImageWithItsOpacity() {
    stamp("one-page.pdf", spec(imageStamp()))
    PDDocument.load(target).use { doc ->
      val page = doc.getPage(0)
      assertEquals(1, drawnImages(page).size)
      assertTrue(opacities(page).any { Math.abs(it - 0.35f) < 1e-4 })
    }
  }

  /** Review Focus 2: same placement as stamp.test.ts on the /Rotate 90 page 3. */
  @Test
  fun changesOnlyTheChosenPageAndPlacesItAsSeen() {
    stamp("mixed-sizes.pdf", spec(imageStamp(pages = listOf(3), angle = 0.0, opacity = 1.0)))
    PDDocument.load(target).use { doc ->
      assertEquals(listOf(0, 0, 1), doc.pages.map { drawnImages(it).size })
      val m = drawnImages(doc.getPage(2)).single().ctm
      assertEquals(402.876, m[4], 0.01)
      assertEquals(210.473, m[5], 0.01)
      assertEquals(90.0, Math.toDegrees(Math.atan2(m[1], m[0])), 0.01)
      assertEquals(420.945, Math.hypot(m[0], m[1]), 0.01)
      assertEquals(210.473, Math.hypot(m[2], m[3]), 0.01)
    }
    PDDocument.load(Fixtures.file("mixed-sizes.pdf")).use { original ->
      PDDocument.load(target).use { doc ->
        for (k in 0..1) {
          assertEquals(
            original.getPage(k).contents.readBytes().toList(),
            doc.getPage(k).contents.readBytes().toList(),
          )
        }
      }
    }
  }

  @Test
  fun embedsAPngUsedTwiceOnce() {
    stamp("mixed-sizes.pdf", spec(imageStamp(pages = listOf(1)), imageStamp(pages = listOf(2, 3))))
    PDDocument.load(target).use { doc ->
      val images = doc.pages.flatMap { drawnImages(it) }.map { it.image.cosObject }
      assertEquals(3, images.size)
      assertEquals(1, images.toSet().size)
    }
  }

  @Test
  fun numbersEveryPage() {
    stamp("two-hundred-pages.pdf", spec(textStamp()))
    PDDocument.load(target).use { doc ->
      assertTrue(textOf(doc, 1).contains("Page 1 of 200"))
      assertTrue(textOf(doc, 200).contains("Page 200 of 200"))
    }
  }

  @Test
  fun countsOnlyTheStampedPagesFromStart() {
    stamp("two-hundred-pages.pdf", spec(textStamp(start = 10, pages = listOf(6, 5, 999))))
    PDDocument.load(target).use { doc ->
      assertTrue(textOf(doc, 5).contains("Page 10 of 11"))
      assertTrue(textOf(doc, 6).contains("Page 11 of 11"))
      assertFalse(textOf(doc, 4).contains(" of "))
    }
  }

  @Test
  fun fallsBackWhenTheTemplateIsNotWinAnsi() {
    stamp("two-hundred-pages.pdf", spec(textStamp(template = "पृष्ठ {n}")))
    PDDocument.load(target).use { doc -> assertTrue(textOf(doc, 1).contains("1 / 200")) }
  }

  @Test
  fun refusesAnEncryptedInput() {
    assertEquals("ERR_PDF_ENCRYPTED", codeOf { stamp("protected.pdf", spec(textStamp())) })
    assertFalse(target.exists())
  }

  @Test
  fun cancelBetweenPagesLeavesNoOutput() {
    var id = ""
    val control = NativeJobs.begin("job-stamp-cancel", { NativeJobs.cancel(id) }, { 0L })
    id = "job-stamp-cancel"
    try {
      assertEquals("ERR_CANCELLED", codeOf { stamp("two-hundred-pages.pdf", spec(textStamp()), control) })
    } finally {
      NativeJobs.end(id)
    }
    assertFalse(target.exists())
  }

  @Test
  fun refusesAPngOutsideTheWorkspace() {
    val outside = File(tmp.newFolder("elsewhere"), "x.png")
    Fixtures.file("images/alpha-200x100.png").copyTo(outside)
    assertEquals("ERR_PERMISSION_DENIED", codeOf { stamp("one-page.pdf", spec(imageStamp(png = "file://${outside.path}"))) })
    assertEquals("ERR_PERMISSION_DENIED", codeOf { stamp("one-page.pdf", spec(imageStamp(png = "content://x/y.png"))) })
    assertFalse(target.exists())
  }

  @Test
  fun refusesMalformedSpecs() {
    for (json in listOf("not json", """{"stamps":[{"kind":"other"}]}""", """{"stamps":[{"kind":"text"}]}""")) {
      assertEquals("ERR_INVALID_NAME", codeOf { stamp("one-page.pdf", json) })
    }
  }
}
