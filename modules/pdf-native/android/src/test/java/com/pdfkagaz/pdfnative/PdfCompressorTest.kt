package com.pdfkagaz.pdfnative

import android.graphics.Bitmap
import android.graphics.Color
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSStream
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.util.zip.DeflaterOutputStream
import kotlin.random.Random
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PdfCompressorTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private lateinit var tempDir: File

  @Before
  fun setUp() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    tempDir = tmp.newFolder("pdfbox-tmp")
  }

  private fun control() = JobControl({}, { 0L })

  private fun compress(source: File, level: String, name: String = "out-$level.pdf"): Pair<File, Int> {
    val target = File(tmp.root, name)
    val n = PdfCompressor.compress(source, target, CompressLevels.of(level), control(), tempDir)
    return target to n
  }

  /** Every image XObject on the pages of [file], by page. */
  private fun <T> images(file: File, block: (List<PDImageXObject>) -> T): T =
    PDDocument.load(file).use { doc ->
      val found = ArrayList<PDImageXObject>()
      for (page in doc.pages) {
        val res = page.resources ?: continue
        for (name in res.xObjectNames) {
          val x = res.getXObject(name)
          if (x is PDImageXObject) found += x
        }
      }
      block(found)
    }

  /** Mean red, green and blue over a grid of samples. */
  private fun meanRgb(bitmap: Bitmap): DoubleArray {
    val sum = DoubleArray(3)
    var n = 0
    for (gy in 0 until 32) for (gx in 0 until 32) {
      val p = bitmap.getPixel(gx * bitmap.width / 32, gy * bitmap.height / 32)
      sum[0] += Color.red(p).toDouble()
      sum[1] += Color.green(p).toDouble()
      sum[2] += Color.blue(p).toDouble()
      n += 1
    }
    return DoubleArray(3) { sum[it] / n }
  }

  @Test
  fun mediumShrinksImageHeavyPdf() {
    val source = Fixtures.file("image-heavy.pdf")
    val (out, n) = compress(source, "medium")
    assertEquals(4, n)
    assertTrue("${out.length()} vs ${source.length()}", out.length() < source.length() * 0.6)
    PDDocument.load(out).use { assertEquals(4, it.numberOfPages) }
    val before = images(source) { list -> list.map { meanRgb(it.image) } }
    images(out) { list ->
      assertEquals(4, list.size)
      for ((k, img) in list.withIndex()) {
        assertTrue(maxOf(img.width, img.height) <= 1600)
        // The same picture, not a blank or garbled one.
        val after = meanRgb(img.image)
        for (c in 0..2) assertEquals("image $k channel $c", before[k][c], after[c], 6.0)
      }
    }
    assertFalse(File(tmp.root, "out-medium.pdf.part").exists())
  }

  @Test
  fun lowIsSmallerThanTheInputButNotSmallerThanMedium() {
    val source = Fixtures.file("image-heavy.pdf")
    val (low, _) = compress(source, "low")
    val (medium, _) = compress(source, "medium")
    assertTrue(low.length() < source.length())
    assertTrue(low.length() >= medium.length())
  }

  @Test
  fun smaskKept() {
    val source = File(tmp.root, "smask.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val bitmap = Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888)
      val rnd = Random(7)
      for (y in 0 until 300) for (x in 0 until 400) {
        bitmap.setPixel(x, y, Color.argb(if (x < 200) 255 else 80, rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)))
      }
      val image = LosslessFactory.createFromImage(doc, bitmap)
      assertNotNull(image.softMask)
      PDPageContentStream(doc, page).use { it.drawImage(image, 50f, 50f, 400f, 300f) }
      doc.save(source)
    }
    val (out, n) = compress(source, "medium")
    assertEquals(1, n)
    images(out) { list ->
      val img = list.single()
      assertEquals(COSName.DCT_DECODE, img.cosObject.getDictionaryObject(COSName.FILTER))
      val mask = img.softMask
      assertNotNull(mask)
      assertEquals(400, mask.width)
      assertEquals(300, mask.height)
    }
  }

  @Test
  fun unsupportedUntouched() {
    val source = File(tmp.root, "bilevel.pdf")
    val raw = ByteArray(200 / 8 * 200).also { Random(3).nextBytes(it) }
    val deflated = java.io.ByteArrayOutputStream().also { b -> DeflaterOutputStream(b).use { it.write(raw) } }.toByteArray()
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val stream = doc.document.createCOSStream()
      stream.setItem(COSName.TYPE, COSName.XOBJECT)
      stream.setItem(COSName.SUBTYPE, COSName.IMAGE)
      stream.setInt(COSName.WIDTH, 200)
      stream.setInt(COSName.HEIGHT, 200)
      stream.setInt(COSName.BITS_PER_COMPONENT, 1)
      stream.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY)
      stream.setItem(COSName.FILTER, COSName.FLATE_DECODE)
      stream.createRawOutputStream().use { it.write(deflated) }
      val image = PDImageXObject(com.tom_roush.pdfbox.pdmodel.common.PDStream(stream), null)
      PDPageContentStream(doc, page).use { it.drawImage(image, 50f, 50f, 200f, 200f) }
      doc.save(source)
    }
    val (out, n) = compress(source, "high")
    assertEquals(0, n)
    images(out) { list ->
      val stream = list.single().cosObject as COSStream
      assertArrayEquals(deflated, stream.createRawInputStream().use { it.readBytes() })
    }
  }

  @Test
  fun textOnlyNotSmaller() {
    val (out, n) = compress(Fixtures.file("one-page.pdf"), "high")
    assertEquals(0, n)
    PDDocument.load(out).use { assertEquals(1, it.numberOfPages) }
  }

  @Test
  fun cancelAfterFirstImage() {
    var t = 0L
    val id = "j-compress-cancel"
    val control = NativeJobs.begin(id, { f -> if (f > 0.0) NativeJobs.cancel(id) }, { t += 1_000; t })
    val target = File(tmp.root, "cancelled.pdf")
    try {
      PdfCompressor.compress(Fixtures.file("image-heavy.pdf"), target, CompressLevels.of("medium"), control, tempDir)
      fail("expected ERR_CANCELLED")
    } catch (e: CodedException) {
      assertEquals("ERR_CANCELLED", e.code)
    } finally {
      NativeJobs.end(id)
    }
    assertFalse(target.exists())
    assertFalse(File(tmp.root, "cancelled.pdf.part").exists())
  }

  @Test
  fun damagedInputIsInvalid() {
    try {
      compress(Fixtures.file("corrupted.pdf"), "medium")
      fail("expected ERR_PDF_INVALID")
    } catch (e: CodedException) {
      assertEquals("ERR_PDF_INVALID", e.code)
    }
  }

  @Test
  fun largeScanCompressesAtHigh() {
    val source = Fixtures.fileOrNull("large/scanned-50mb.pdf")
    assumeTrue("large fixtures not generated", source != null)
    val (out, n) = compress(source!!, "high")
    assertTrue(n > 0)
    assertTrue("${out.length()} vs ${source.length()}", out.length() < source.length())
  }
}
