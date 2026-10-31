package com.pdfkagaz.pdfnative

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
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

  private class Fake(private val words: List<OcrWord>, private val onPage: (Int) -> Unit = {}) : PageRecognizer {
    val seen = ArrayList<Int>()

    override fun recognize(pageIndex: Int): RecognizedPage {
      seen += pageIndex
      onPage(pageIndex)
      return RecognizedPage(1224, 1584, words)
    }
  }

  private val two = listOf(OcrWord("Invoice", 100, 200, 300, 240), OcrWord("2026-118", 320, 200, 520, 240))

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
    // The real-text page of the scan (one-page.pdf is only 15 characters, under MIN_TEXT_CHARS).
    val textOnly = File(tmp.root, "text-only.pdf")
    PDDocument.load(Fixtures.file("scanned-text.pdf")).use { doc ->
      doc.removePage(1)
      doc.removePage(0)
      doc.save(textOnly)
    }
    val fake = Fake(two)
    val stats = PdfOcr.run(textOnly, target, fake, control(), tempDir)
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
}
