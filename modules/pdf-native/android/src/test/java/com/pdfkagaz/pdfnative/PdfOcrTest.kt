package com.pdfkagaz.pdfnative

import android.net.Uri
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PdfOcrTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var tempDir: File
  private lateinit var target: File
  private val emitted = ArrayList<Double>()

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    tempDir = tmp.newFolder("pdfbox-ocr")
    target = File(tmp.root, "out-ocr.pdf")
  }

  private fun control() = JobControl({ emitted += it }, { 0L })

  private class Fake(private val lines: List<List<OcrWord>>, private val onPage: (Int) -> Unit = {}) : PageRecognizer, AutoCloseable {
    val seen = ArrayList<Int>()
    var closed = false

    override fun recognize(pageIndex: Int): RecognizedPage {
      seen += pageIndex
      onPage(pageIndex)
      return RecognizedPage(1224, 1584, lines)
    }

    override fun close() {
      closed = true
    }
  }

  // One line of two words whose boxes touch (as ML Kit's padded boxes often do).
  private val two = listOf(listOf(OcrWord("Invoice", 100, 200, 300, 240), OcrWord("2026-118", 300, 200, 520, 240)))

  private fun workspaceCopy(jobId: String, source: File): File {
    val dir = File(RuntimeEnvironment.getApplication().cacheDir, "${ToolPaths.DIR}/$jobId").apply { mkdirs() }
    return File(dir, "in.pdf").apply { writeBytes(source.readBytes()) }
  }

  private fun textOnly(): File {
    // The real-text page of the scan (one-page.pdf is only 15 characters, under MIN_TEXT_CHARS).
    val file = File(tmp.root, "text-only.pdf")
    PDDocument.load(Fixtures.file("scanned-text.pdf")).use { doc ->
      doc.removePage(1)
      doc.removePage(0)
      doc.save(file)
    }
    return file
  }

  private fun pageText(file: File, index: Int): String = PDDocument.load(file).use { doc ->
    PDFTextStripper().apply { startPage = index + 1; endPage = index + 1 }.getText(doc)
  }

  @Test
  fun mixedSkipsTextPage() {
    val fake = Fake(two)
    val source = Fixtures.file("scanned-text.pdf")
    val stats = PdfOcr.run(source, target, fake, control(), tempDir)
    assertEquals(OcrStats(3, 2, 2, 1, 4), stats)
    assertEquals(listOf(0, 1), fake.seen)
    assertTrue(target.isFile)
    assertTrue(pageText(target, 0).contains("Invoice 2026-118"))
    assertEquals(pageText(source, 2), pageText(target, 2))
  }

  @Test
  fun allTextSkipsAndWritesNothing() {
    val fake = Fake(two)
    val stats = PdfOcr.run(textOnly(), target, fake, control(), tempDir)
    assertEquals(stats.pageCount, stats.pagesSkipped)
    assertEquals(0, stats.wordsAdded)
    assertTrue(fake.seen.isEmpty())
    assertFalse(target.exists())
  }

  @Test
  fun noWordsWritesNothing() {
    val stats = PdfOcr.run(Fixtures.file("scanned-text.pdf"), target, Fake(emptyList()), control(), tempDir)
    assertEquals(0, stats.wordsAdded)
    assertEquals(0, stats.pagesWithText)
    assertFalse(target.exists())
  }

  @Test
  fun cancelLeavesNoOutput() {
    val control = NativeJobs.begin("ocr-cancel", {})
    try {
      PdfOcr.run(Fixtures.file("scanned-text.pdf"), target, Fake(two) { NativeJobs.cancel("ocr-cancel") }, control, tempDir)
      fail("expected cancel")
    } catch (e: CancelledException) {
      // expected
    } finally {
      NativeJobs.end("ocr-cancel")
    }
    assertFalse(target.exists())
  }

  @Test
  fun progressEndsAtOne() {
    PdfOcr.run(Fixtures.file("scanned-text.pdf"), target, Fake(two), control(), tempDir)
    assertEquals(1.0, emitted.last(), 0.0)
  }

  @Test
  fun workspaceRefusesAFileOutsideTheJobFolder() {
    val context = RuntimeEnvironment.getApplication()
    val other = File(context.cacheDir, "${ToolPaths.DIR}/other-job").apply { mkdirs() }
    val file = File(other, "in.pdf").apply { writeBytes(Fixtures.file("scanned-text.pdf").readBytes()) }
    val outside = File(tmp.root, "in.pdf").apply { writeBytes(file.readBytes()) }
    for (f in listOf(file, outside)) {
      try {
        PdfOcr.ocrInWorkspace(context, "my-job", Uri.fromFile(f).toString(), control()) { Fake(two) }
        fail("expected ERR_PERMISSION_DENIED")
      } catch (e: PermissionDeniedException) {
        // expected
      }
    }
  }

  @Test
  fun workspaceWithWordsPublishesAndCleansUp() {
    val context = RuntimeEnvironment.getApplication()
    val input = workspaceCopy("ocr-words", Fixtures.file("scanned-text.pdf"))
    val fake = Fake(two)
    val result = PdfOcr.ocrInWorkspace(context, "ocr-words", Uri.fromFile(input).toString(), control()) { fake }
    val out = File(input.parentFile, "out-ocr.pdf")
    assertEquals(out.canonicalFile, File(Uri.parse(result["uri"] as String).path!!).canonicalFile)
    assertTrue((result["sizeBytes"] as Long) > 0)
    assertEquals(out.length(), result["sizeBytes"])
    assertEquals(4, result["wordsAdded"])
    assertFalse(File(input.parentFile, "pdfbox-ocr").exists())
    assertTrue(fake.closed)
  }

  @Test
  fun workspaceWithoutWordsReturnsNoFile() {
    val context = RuntimeEnvironment.getApplication()
    val input = workspaceCopy("ocr-empty", Fixtures.file("scanned-text.pdf"))
    val fake = Fake(emptyList())
    val result = PdfOcr.ocrInWorkspace(context, "ocr-empty", Uri.fromFile(input).toString(), control()) { fake }
    assertNull(result["uri"])
    assertEquals(0L, result["sizeBytes"])
    assertEquals(0, result["wordsAdded"])
    assertFalse(File(input.parentFile, "out-ocr.pdf").exists())
    assertFalse(File(input.parentFile, "pdfbox-ocr").exists())
    assertTrue(fake.closed)
  }

  @Test
  fun workspaceAllTextNeverMakesTheRecognizer() {
    val context = RuntimeEnvironment.getApplication()
    val input = workspaceCopy("ocr-all-text", textOnly())
    var made = 0
    val result = PdfOcr.ocrInWorkspace(context, "ocr-all-text", Uri.fromFile(input).toString(), control()) {
      made += 1
      Fake(two)
    }
    assertEquals(0, made)
    assertNull(result["uri"])
    assertEquals(result["pageCount"], result["pagesSkipped"])
  }
}
