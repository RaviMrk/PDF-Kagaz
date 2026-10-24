package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSStream
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationText
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
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
class PageAssemblyTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var outDir: File
  private lateinit var tempDir: File

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    outDir = tmp.newFolder("job")
    tempDir = File(outDir, "pdfbox-assemble")
  }

  private fun control(onProgress: (Double) -> Unit = {}): Pair<String, JobControl> {
    val id = "test-${UUID.randomUUID()}"
    return id to NativeJobs.begin(id, onProgress, { 0L })
  }

  private fun refs(input: Int, pages: IntRange, rotate: Int = 0) = pages.map { PageRef(input, it, rotate) }

  private fun <T> pdf(file: File, block: (PDDocument) -> T): T = PDDocument.load(file).use(block)

  @Test
  fun mergesEveryPageInOrderWithSizesAndRotation() {
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("one-page.pdf"), Fixtures.file("mixed-sizes.pdf")),
        listOf(refs(0, 0..0) + refs(1, 0..2)),
        outDir,
        control,
        tempDir,
      )
    } finally {
      NativeJobs.end(id)
    }
    assertEquals(listOf("out-native-1.pdf"), outputs.map { it.name })
    pdf(outputs[0]) { doc ->
      assertEquals(4, doc.numberOfPages)
      val sizes = doc.pages.map { Math.round(it.mediaBox.width) to Math.round(it.mediaBox.height) }
      assertEquals(listOf(595 to 842, 595 to 842, 792 to 612, 595 to 842), sizes)
      assertEquals(listOf(0, 0, 0, 90), doc.pages.map { it.rotation })
    }
  }

  @Test
  fun splitsIntoOneFilePerGroup() {
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("two-hundred-pages.pdf")),
        listOf(refs(0, 0..2), refs(0, 4..4), refs(0, 7..9)),
        outDir,
        control,
        tempDir,
      )
    } finally {
      NativeJobs.end(id)
    }
    assertEquals(listOf("out-native-1.pdf", "out-native-2.pdf", "out-native-3.pdf"), outputs.map { it.name })
    assertEquals(listOf(3, 1, 3), outputs.map { f -> pdf(f) { it.numberOfPages } })
  }

  @Test
  fun organizesADuplicatedPageIndependently() {
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("one-page.pdf")),
        listOf(listOf(PageRef(0, 0, 90), PageRef(0, 0, 0))),
        outDir,
        control,
        tempDir,
      )
    } finally {
      NativeJobs.end(id)
    }
    pdf(outputs[0]) { doc ->
      assertEquals(2, doc.numberOfPages)
      assertEquals(listOf(90, 0), doc.pages.map { it.rotation })
      assertNotSame(doc.getPage(0).cosObject, doc.getPage(1).cosObject)
      // Whitespace aside: the stripper breaks the lines of a rotated page differently.
      val letters = { text: String -> text.filterNot { it.isWhitespace() } }
      val source = pdf(Fixtures.file("one-page.pdf")) { letters(PDFTextStripper().getText(it)) }
      assertTrue(source.isNotEmpty())
      for (page in 1..2) {
        val text = PDFTextStripper().apply {
          startPage = page
          endPage = page
        }.getText(doc)
        assertEquals(source, letters(text))
      }
    }
  }

  @Test
  fun dropsLinksAndFormWidgetsButKeepsOtherAnnotations() {
    val input = File(tmp.root, "annotated.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val note = PDAnnotationText().apply { this.page = page }
      page.annotations = listOf(PDAnnotationLink(), PDAnnotationWidget(), note)
      doc.save(input)
    }
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(listOf(input), listOf(refs(0, 0..0)), outDir, control, tempDir)
    } finally {
      NativeJobs.end(id)
    }
    pdf(outputs[0]) { doc ->
      val annotations = doc.getPage(0).annotations
      assertEquals(listOf("Text"), annotations.map { it.subtype })
      assertTrue(annotations[0].cosObject.getDictionaryObject(COSName.P) == null)
    }
  }

  @Test
  fun namesOutputsFromTheFirstOutputIndex() {
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("mixed-sizes.pdf")),
        listOf(refs(0, 0..0), refs(0, 1..2)),
        outDir,
        control,
        tempDir,
        firstOutput = 4,
      )
    } finally {
      NativeJobs.end(id)
    }
    assertEquals(listOf("out-native-4.pdf", "out-native-5.pdf"), outputs.map { it.name })
    assertEquals(listOf(1, 2), outputs.map { f -> pdf(f) { it.numberOfPages } })
  }

  @Test
  fun extraRotationWrapsPast360() {
    val input = File(tmp.root, "rotated.pdf")
    PDDocument().use { doc ->
      doc.addPage(PDPage().apply { rotation = 270 })
      doc.save(input)
    }
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(
        listOf(input, Fixtures.file("mixed-sizes.pdf")),
        listOf(listOf(PageRef(0, 0, 180), PageRef(1, 2, 270), PageRef(1, 2, 180))),
        outDir,
        control,
        tempDir,
      )
    } finally {
      NativeJobs.end(id)
    }
    pdf(outputs[0]) { doc -> assertEquals(listOf(90, 0, 270), doc.pages.map { it.rotation }) }
  }

  @Test
  fun aDamagedContentStreamIsPdfInvalidAndLeavesNoOutput() {
    val input = File(tmp.root, "damaged-content.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val stream: COSStream = doc.document.createCOSStream()
      stream.createRawOutputStream().use { it.write(byteArrayOf(1, 2, 3, 4)) }
      stream.setItem(COSName.FILTER, COSName.getPDFName("NoSuchDecode"))
      page.cosObject.setItem(COSName.CONTENTS, stream)
      doc.save(input)
    }
    val (id, control) = control()
    val e = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("one-page.pdf"), input),
        listOf(refs(0, 0..0), refs(1, 0..0)),
        outDir,
        control,
        tempDir,
      )
      fail("Expected ERR_PDF_INVALID")
      throw AssertionError()
    } catch (e: CodedException) {
      e
    } finally {
      NativeJobs.end(id)
    }
    assertEquals("ERR_PDF_INVALID", e.code)
    assertEquals(emptyList<String>(), outDir.list()!!.filter { it.startsWith("out-native") })
  }

  @Test
  fun cancelAfterTheFirstPageLeavesNoOutput() {
    var id = ""
    val (jobId, control) = control { NativeJobs.cancel(id) }
    id = jobId
    val e = try {
      PageAssembly.assemble(
        listOf(Fixtures.file("mixed-sizes.pdf")),
        listOf(refs(0, 0..2), refs(0, 0..0)),
        outDir,
        control,
        tempDir,
      )
      fail("Expected ERR_CANCELLED")
      throw AssertionError()
    } catch (e: CodedException) {
      e
    } finally {
      NativeJobs.end(id)
    }
    assertEquals("ERR_CANCELLED", e.code)
    assertEquals(emptyList<String>(), outDir.list()!!.filter { it.startsWith("out-native") })
  }

  @Test
  fun parseOutputsReadsRefs() {
    assertEquals(
      listOf(listOf(PageRef(0, 1, 90), PageRef(1, 0, 0)), listOf(PageRef(0, 0, 270))),
      PageAssembly.parseOutputs("""[[{"i":0,"p":1,"r":90},{"i":1,"p":0,"r":0}],[{"i":0,"p":0,"r":270}]]"""),
    )
  }

  @Test
  fun parseOutputsRejectsBadInput() {
    val tooMany = "[[" + (0..10_000).joinToString(",") { """{"i":0,"p":0,"r":0}""" } + "]]"
    for (json in listOf(
      """[[{"i":0,"p":-1,"r":0}]]""",
      """[[{"i":-1,"p":0,"r":0}]]""",
      """[[{"i":0,"p":0,"r":45}]]""",
      """[[]]""",
      """[]""",
      "not json",
      tooMany,
    )) {
      val e = try {
        PageAssembly.parseOutputs(json)
        fail("Expected ERR_INVALID_NAME")
        throw AssertionError()
      } catch (e: CodedException) {
        e
      }
      assertEquals("ERR_INVALID_NAME", e.code)
    }
  }

  @Test
  fun refusesAPageOutOfRange() {
    val (id, control) = control()
    val e = try {
      PageAssembly.assemble(listOf(Fixtures.file("one-page.pdf")), listOf(refs(0, 1..1)), outDir, control, tempDir)
      fail("Expected ERR_INVALID_NAME")
      throw AssertionError()
    } catch (e: CodedException) {
      e
    } finally {
      NativeJobs.end(id)
    }
    assertEquals("ERR_INVALID_NAME", e.code)
  }

  /** Review Focus 3: a 500-page, 100 MB input in the default Robolectric heap. */
  @Test
  fun assemblesFiveHundredPagesWithoutRunningOutOfMemory() {
    val large = Fixtures.fileOrNull("large/five-hundred-pages.pdf")
    assumeTrue("large/five-hundred-pages.pdf not generated", large != null)
    val (id, control) = control()
    val outputs = try {
      PageAssembly.assemble(listOf(large!!), listOf(refs(0, 0 until 500)), outDir, control, tempDir)
    } finally {
      NativeJobs.end(id)
    }
    val count = PdfBoxSupport.open(outputs[0], null, tmp.newFolder("check")).use { it.numberOfPages }
    assertEquals(500, count)
  }
}
