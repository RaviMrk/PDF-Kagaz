package com.pdfkagaz.pdfnative

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Color
import com.tom_roush.pdfbox.cos.COSArray
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSInteger
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSStream
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
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

  /** A 1400 × 700 noise image whose SMask is opaque on the left half and 80 on the right. */
  private fun smaskPdf(name: String, matte: Boolean): File {
    val source = File(tmp.root, name)
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val bitmap = Bitmap.createBitmap(1400, 700, Bitmap.Config.ARGB_8888)
      val rnd = Random(7)
      for (y in 0 until 700) for (x in 0 until 1400) {
        bitmap.setPixel(x, y, Color.argb(if (x < 700) 255 else 80, rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)))
      }
      val image = LosslessFactory.createFromImage(doc, bitmap)
      assertNotNull(image.softMask)
      if (matte) {
        val values = COSArray().apply { repeat(3) { add(COSInteger.ZERO) } }
        image.softMask.cosObject.setItem(COSName.getPDFName("Matte"), values)
      }
      PDPageContentStream(doc, page).use { it.drawImage(image, 50f, 50f, 500f, 250f) }
      doc.save(source)
    }
    return source
  }

  private fun rawBytes(stream: COSStream) = stream.createRawInputStream().use { it.readBytes() }

  @Test
  fun smaskKeptAndResizedWithItsImage() {
    val (out, n) = compress(smaskPdf("smask.pdf", matte = false), "high")
    assertEquals(1, n)
    images(out) { list ->
      val img = list.single()
      assertEquals(COSName.DCT_DECODE, img.cosObject.getDictionaryObject(COSName.FILTER))
      assertEquals(1024 to 512, img.width to img.height)
      val mask = img.softMask
      assertNotNull(mask)
      assertEquals(1024 to 512, mask.width to mask.height)
      assertEquals(8, mask.bitsPerComponent)
      assertEquals(COSName.FLATE_DECODE, mask.cosObject.getDictionaryObject(COSName.FILTER))
      // The alpha itself survives the resize: opaque left, 80 right.
      val alpha = mask.image
      assertEquals(255.0, PdfCompressor.graySample(alpha.getPixel(100, 256)).toDouble(), 2.0)
      assertEquals(80.0, PdfCompressor.graySample(alpha.getPixel(900, 256)).toDouble(), 2.0)
    }
  }

  @Test
  fun grayFlateImageKeepsItsTones() {
    // PdfBox-Android decodes 8-bit gray into the alpha of white pixels; the JPEG must keep the tones.
    val (w, h) = 800 to 600
    val rnd = Random(9)
    val samples = ByteArray(w * h) { i -> ((if (i % w < w / 2) 40 else 200) + rnd.nextInt(30)).toByte() }
    val deflated = java.io.ByteArrayOutputStream().also { o -> DeflaterOutputStream(o).use { it.write(samples) } }.toByteArray()
    val source = File(tmp.root, "gray.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val stream = doc.document.createCOSStream()
      stream.setItem(COSName.TYPE, COSName.XOBJECT)
      stream.setItem(COSName.SUBTYPE, COSName.IMAGE)
      stream.setInt(COSName.WIDTH, w)
      stream.setInt(COSName.HEIGHT, h)
      stream.setInt(COSName.BITS_PER_COMPONENT, 8)
      stream.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY)
      stream.setItem(COSName.FILTER, COSName.FLATE_DECODE)
      stream.createRawOutputStream().use { it.write(deflated) }
      val image = PDImageXObject(com.tom_roush.pdfbox.pdmodel.common.PDStream(stream), null)
      PDPageContentStream(doc, page).use { it.drawImage(image, 50f, 50f, 400f, 300f) }
      doc.save(source)
    }
    val (out, n) = compress(source, "high")
    assertEquals(1, n)
    images(out) { list ->
      val jpeg = rawBytes(list.single().cosObject as COSStream)
      val bitmap = android.graphics.BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
      assertEquals(55.0, Color.red(bitmap.getPixel(100, 300)).toDouble(), 20.0)
      assertEquals(215.0, Color.red(bitmap.getPixel(700, 300)).toDouble(), 20.0)
    }
  }

  @Test
  fun smaskWithMatteUntouched() {
    val source = smaskPdf("matte.pdf", matte = true)
    val before = images(source) { list -> rawBytes(list.single().cosObject as COSStream) }
    val (out, n) = compress(source, "high")
    assertEquals(0, n)
    images(out) { list ->
      val img = list.single()
      assertEquals(1400 to 700, img.width to img.height)
      assertArrayEquals(before, rawBytes(img.cosObject as COSStream))
    }
  }

  @Test
  fun rgbCodedJpegUntouched() {
    val source = File(tmp.root, "colortransform.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val bitmap = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888)
      val rnd = Random(11)
      for (y in 0 until 600) for (x in 0 until 800) bitmap.setPixel(x, y, Color.rgb(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)))
      val image = JPEGFactory.createFromImage(doc, bitmap, 0.95f)
      image.cosObject.setItem(COSName.DECODE_PARMS, COSDictionary().apply { setInt(COSName.getPDFName("ColorTransform"), 0) })
      PDPageContentStream(doc, page).use { it.drawImage(image, 50f, 50f, 400f, 300f) }
      doc.save(source)
    }
    val before = images(source) { list -> rawBytes(list.single().cosObject as COSStream) }
    val (out, n) = compress(source, "high")
    assertEquals(0, n)
    images(out) { list -> assertArrayEquals(before, rawBytes(list.single().cosObject as COSStream)) }
  }

  @Test
  fun hugeJpegIsDecodedWithinThePixelCap() {
    // 4700 × 4700 at low (2400): power-of-2 sampling alone would decode all 22 MP; the cap halves it.
    val side = 4700
    val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.RGB_565)
    val canvas = Canvas(bitmap)
    val paint = Paint()
    val rnd = Random(5)
    repeat(4000) {
      paint.color = Color.rgb(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256))
      val x = rnd.nextInt(side).toFloat()
      val y = rnd.nextInt(side).toFloat()
      canvas.drawRect(x, y, x + 40 + rnd.nextInt(200), y + 40 + rnd.nextInt(200), paint)
    }
    val jpeg = java.io.ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 100, it) }.toByteArray()
    bitmap.recycle()
    val source = File(tmp.root, "huge.pdf")
    PDDocument().use { doc ->
      val page = PDPage()
      doc.addPage(page)
      val stream = doc.document.createCOSStream()
      stream.setItem(COSName.TYPE, COSName.XOBJECT)
      stream.setItem(COSName.SUBTYPE, COSName.IMAGE)
      stream.setInt(COSName.WIDTH, side)
      stream.setInt(COSName.HEIGHT, side)
      stream.setInt(COSName.BITS_PER_COMPONENT, 8)
      stream.setItem(COSName.COLORSPACE, COSName.DEVICERGB)
      stream.setItem(COSName.FILTER, COSName.DCT_DECODE)
      stream.createRawOutputStream().use { it.write(jpeg) }
      val image = PDImageXObject(com.tom_roush.pdfbox.pdmodel.common.PDStream(stream), null)
      PDPageContentStream(doc, page).use { it.drawImage(image, 0f, 0f, 500f, 500f) }
      doc.save(source)
    }
    val (out, n) = compress(source, "low")
    assertEquals(1, n)
    images(out) { list -> assertEquals(2350 to 2350, list.single().width to list.single().height) }
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
