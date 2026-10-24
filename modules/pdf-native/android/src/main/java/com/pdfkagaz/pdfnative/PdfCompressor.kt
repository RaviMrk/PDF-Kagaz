package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.tom_roush.pdfbox.cos.COSArray
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.cos.COSStream
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.common.PDStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.Collections
import java.util.IdentityHashMap
import java.util.zip.DeflaterOutputStream

/**
 * Compress (T-06): re-encodes the eligible images of a PDF as smaller JPEGs, in place in their
 * own streams, so every page (and every page sharing an image) keeps pointing at them. Eligible:
 * 8-bit DeviceGray / DeviceRGB / ICCBased (N = 1 or 3), DCT or Flate, at least [MIN_SIDE] px each
 * side, no /Decode, /Mask or /ImageMask, no /SMask with /Matte or /Decode, and no RGB-coded JPEG
 * (/ColorTransform 0). JPX, JBIG2, CCITT, CMYK, Indexed, masks and inline images are left alone.
 * An image's /SMask is kept, resized with a downscaled image (8-bit Flate gray). A stream is replaced only when the new one is
 * under [REPLACE_RATIO] of the old; an unfiltered image stream gets Flate instead. The full rewrite
 * on save drops unreferenced objects (and the dropped thumbnails). Disk work: call on Dispatchers.IO.
 */
object PdfCompressor {
  const val MIN_SIDE = 64
  const val REPLACE_RATIO = 0.9

  /** The most pixels one decoded bitmap may have (RENDER_MAX_PIXELS): 48 MB as ARGB_8888. */
  const val MAX_DECODE_PIXELS = 12_582_912L

  private val MATTE = COSName.getPDFName("Matte")
  private val COLOR_TRANSFORM = COSName.getPDFName("ColorTransform")

  /**
   * Writes [source] compressed at [level] to [target] (through a part file) and returns how many
   * images were replaced. [control] is checked and progress reported per image; a cancel or any
   * failure leaves no [target]. Damaged → ERR_PDF_INVALID; out of memory → ERR_TOO_LARGE.
   */
  fun compress(source: File, target: File, level: CompressLevels.Level, control: JobControl, tempDir: File): Int {
    control.check()
    PdfBoxSupport.open(source, null, File(tempDir, "in")).use { doc ->
      val images = PdfBoxSupport.mapReadErrors {
        if (level.dropThumbnails) for (page in doc.pages) page.cosObject.removeItem(COSName.THUMB)
        collectImages(doc)
      }
      // The save counts as one more unit.
      val units = images.size + 1.0
      var replaced = 0
      for ((k, image) in images.withIndex()) {
        control.check()
        if (PdfBoxSupport.mapReadErrors { replace(doc, image, level, tempDir) }) replaced += 1
        control.progress((k + 1) / units)
      }
      control.check()
      PdfBoxSupport.saveTo(doc, target)
      control.progress(1.0)
      return replaced
    }
  }

  /**
   * The image XObjects of every page and of the forms they draw, each once (shared ones too).
   * Streams used as another image's /SMask are not images of their own here.
   */
  private fun collectImages(doc: PDDocument): List<COSStream> {
    val seen: MutableSet<COSBase> = Collections.newSetFromMap(IdentityHashMap())
    val images = ArrayList<COSStream>()
    fun visit(resources: COSDictionary?) {
      if (resources == null || !seen.add(resources)) return
      val xObjects = resources.getDictionaryObject(COSName.XOBJECT) as? COSDictionary ?: return
      for (key in xObjects.keySet()) {
        val stream = xObjects.getDictionaryObject(key) as? COSStream ?: continue
        if (!seen.add(stream)) continue
        when (stream.getCOSName(COSName.SUBTYPE)) {
          COSName.IMAGE -> images += stream
          COSName.FORM -> visit(stream.getDictionaryObject(COSName.RESOURCES) as? COSDictionary)
          else -> Unit
        }
      }
    }
    for (page in doc.pages) visit(page.resources?.cosObject)
    val masks: MutableSet<COSBase> = Collections.newSetFromMap(IdentityHashMap())
    for (image in images) image.getDictionaryObject(COSName.SMASK)?.let(masks::add)
    return images.filter { it !in masks }
  }

  private fun replace(doc: PDDocument, image: COSStream, level: CompressLevels.Level, tempDir: File): Boolean {
    val filters = filtersOf(image) ?: return false
    if (filters.isEmpty()) return deflate(image, tempDir)
    if (!isEligible(image, filters)) return false
    val jpeg = reencode(image, filters.single(), level) ?: return false
    if (jpeg.size >= image.length * REPLACE_RATIO) return false
    // A soft mask sized like the old image is resized with it (before anything is written).
    val softMask = image.getDictionaryObject(COSName.SMASK) as? COSStream
    val newMask = if (softMask != null && !sameSize(softMask, jpeg.width, jpeg.height)) {
      resizedMask(softMask, jpeg.width, jpeg.height) ?: return false
    } else {
      null
    }
    PdfBoxSupport.mapSaveErrors {
      image.createRawOutputStream().use { it.write(jpeg.bytes) }
      if (newMask != null) image.setItem(COSName.SMASK, maskStream(doc, newMask))
    }
    image.setItem(COSName.FILTER, COSName.DCT_DECODE)
    image.removeItem(COSName.DECODE_PARMS)
    image.setInt(COSName.WIDTH, jpeg.width)
    image.setInt(COSName.HEIGHT, jpeg.height)
    image.setInt(COSName.BITS_PER_COMPONENT, 8)
    // Gray and ICC images were decoded to sRGB, and Android writes three-channel JPEGs.
    image.setItem(COSName.COLORSPACE, COSName.DEVICERGB)
    return true
  }

  private fun sameSize(stream: COSStream, w: Int, h: Int) =
    stream.getInt(COSName.WIDTH) == w && stream.getInt(COSName.HEIGHT) == h

  /** An alpha plane: one byte per pixel, row by row. */
  private class Alpha(val bytes: ByteArray, val width: Int, val height: Int)

  /**
   * [mask]'s samples scaled to [w]×[h] (decoded subsampled and bounded like an image); null when
   * it cannot be decoded, so its image stays as it is.
   */
  private fun resizedMask(mask: COSStream, w: Int, h: Int): Alpha? {
    val mw = mask.getInt(COSName.WIDTH)
    val mh = mask.getInt(COSName.HEIGHT)
    if (mw <= 0 || mh <= 0) return null
    val subsampling = CompressLevels.decodeSubsampling(mw, mh, maxOf(w, h), MAX_DECODE_PIXELS)
    var bitmap: Bitmap? = null
    try {
      bitmap = PDImageXObject(PDStream(mask), null).getImage(null, subsampling) ?: return null
      if (bitmap.width != w || bitmap.height != h) {
        val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
        if (scaled !== bitmap) bitmap.recycle()
        bitmap = scaled
      }
      val pixels = IntArray(w)
      val bytes = ByteArray(w * h)
      for (y in 0 until h) {
        bitmap.getPixels(pixels, 0, w, 0, y, w, 1)
        for (x in 0 until w) bytes[y * w + x] = graySample(pixels[x]).toByte()
      }
      return Alpha(bytes, w, h)
    } catch (e: IOException) {
      return null
    } catch (e: RuntimeException) {
      return null
    } catch (e: OutOfMemoryError) {
      return null
    } finally {
      bitmap?.recycle()
    }
  }

  /**
   * The gray sample of a pixel PdfBox-Android decoded from a one-component image: it puts the
   * sample into the alpha of a white pixel, so alpha × red covers that and an opaque gray alike.
   */
  internal fun graySample(pixel: Int): Int = (pixel ushr 24) * (pixel shr 16 and 0xff) / 255

  /** A new 8-bit DeviceGray Flate soft mask holding [alpha]. */
  private fun maskStream(doc: PDDocument, alpha: Alpha): COSStream {
    val stream = doc.document.createCOSStream()
    stream.setItem(COSName.TYPE, COSName.XOBJECT)
    stream.setItem(COSName.SUBTYPE, COSName.IMAGE)
    stream.setInt(COSName.WIDTH, alpha.width)
    stream.setInt(COSName.HEIGHT, alpha.height)
    stream.setInt(COSName.BITS_PER_COMPONENT, 8)
    stream.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY)
    stream.createOutputStream(COSName.FLATE_DECODE).use { it.write(alpha.bytes) }
    return stream
  }

  /** The image's filter names (empty: unfiltered); null when /Filter is malformed. */
  private fun filtersOf(image: COSStream): List<COSName>? =
    when (val f = image.getDictionaryObject(COSName.FILTER)) {
      null -> emptyList()
      is COSName -> listOf(f)
      is COSArray -> (0 until f.size()).map { f.getObject(it) as? COSName ?: return null }
      else -> null
    }

  private fun isEligible(image: COSStream, filters: List<COSName>): Boolean {
    if (filters.size != 1 || filters[0] != COSName.DCT_DECODE && filters[0] != COSName.FLATE_DECODE) return false
    if (image.getBoolean(COSName.IMAGE_MASK, false)) return false
    if (image.containsKey(COSName.MASK) || image.containsKey(COSName.DECODE)) return false
    if (image.getInt(COSName.BITS_PER_COMPONENT) != 8) return false
    if (image.getInt(COSName.WIDTH) < MIN_SIDE || image.getInt(COSName.HEIGHT) < MIN_SIDE) return false
    if (filters[0] == COSName.DCT_DECODE && isRgbCoded(image)) return false
    val softMask = image.getDictionaryObject(COSName.SMASK)
    if (softMask != null) {
      // /Matte (pre-multiplied colour) ties the mask to the image's exact samples and size.
      if (softMask !is COSStream || softMask.containsKey(MATTE) || softMask.containsKey(COSName.DECODE)) return false
    }
    return isGrayOrRgb(image.getDictionaryObject(COSName.COLORSPACE))
  }

  /** `/DecodeParms << /ColorTransform 0 >>`: RGB-coded samples, which BitmapFactory would read as YCbCr. */
  private fun isRgbCoded(image: COSStream): Boolean {
    val parms = when (val p = image.getDictionaryObject(COSName.DECODE_PARMS)) {
      is COSDictionary -> p
      is COSArray -> p.getObject(0) as? COSDictionary
      else -> null
    } ?: return false
    return parms.getInt(COLOR_TRANSFORM, -1) == 0
  }

  private fun isGrayOrRgb(cs: COSBase?): Boolean = when (cs) {
    COSName.DEVICEGRAY, COSName.DEVICERGB -> true
    is COSArray -> {
      val profile = cs.getObject(1) as? COSStream
      cs.size() == 2 && cs.getObject(0) == COSName.ICCBASED && profile != null && profile.getInt(COSName.N) in setOf(1, 3)
    }
    else -> false
  }

  private class Jpeg(val bytes: ByteArray, val width: Int, val height: Int) {
    val size get() = bytes.size
  }

  /**
   * Decodes [image] subsampled close to the level's long side, scales it down to the target size
   * and encodes it as JPEG. A damaged image, or one too large for memory, stays as it is (null).
   * JPEGs are decoded by BitmapFactory with inSampleSize (PdfBox-Android's own JPEG path ignores
   * subsampling, and misreads JPEGs when subsampled); Flate images through PdfBox.
   */
  private fun reencode(image: COSStream, filter: COSName, level: CompressLevels.Level): Jpeg? {
    var bitmap: Bitmap? = null
    try {
      // A JPEG's own bounds (not the dictionary's) decide the sampling, before any pixel is decoded;
      // the decoded bitmap never has more than MAX_DECODE_PIXELS.
      val bounds = if (filter == COSName.DCT_DECODE) jpegBounds(image) else image.getInt(COSName.WIDTH) to image.getInt(COSName.HEIGHT)
      val (w, h) = bounds ?: return null
      if (w <= 0 || h <= 0) return null
      val (tw, th) = CompressLevels.targetSize(w, h, level.maxLongSidePx)
      val subsampling = CompressLevels.decodeSubsampling(w, h, maxOf(tw, th), MAX_DECODE_PIXELS)
      bitmap = if (filter == COSName.DCT_DECODE) {
        val options = BitmapFactory.Options().apply {
          inSampleSize = subsampling
          inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        image.createRawInputStream().use { BitmapFactory.decodeStream(it, null, options) }
      } else {
        decodeWithoutSoftMask(image, subsampling)
      } ?: return null
      if (bitmap.width > tw || bitmap.height > th) {
        val scaled = Bitmap.createScaledBitmap(bitmap, tw, th, true)
        if (scaled !== bitmap) bitmap.recycle()
        bitmap = scaled
      }
      val out = ByteArrayOutputStream()
      if (!bitmap.compress(Bitmap.CompressFormat.JPEG, level.jpegQuality, out)) return null
      return Jpeg(out.toByteArray(), bitmap.width, bitmap.height)
    } catch (e: IOException) {
      return null
    } catch (e: RuntimeException) {
      return null
    } catch (e: OutOfMemoryError) {
      return null
    } finally {
      bitmap?.recycle()
    }
  }

  /** The JPEG's width and height from its header (nothing decoded); null when unreadable. */
  private fun jpegBounds(image: COSStream): Pair<Int, Int>? {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    image.createRawInputStream().use { BitmapFactory.decodeStream(it, null, options) }
    return if (options.outWidth > 0 && options.outHeight > 0) options.outWidth to options.outHeight else null
  }

  /**
   * PDImageXObject.getImage blends the /SMask into the bitmap's alpha, which a JPEG cannot keep;
   * the color samples alone are decoded, with the /SMask taken off the dictionary meanwhile.
   */
  private fun decodeWithoutSoftMask(image: COSStream, subsampling: Int): Bitmap? {
    val softMask = image.getItem(COSName.SMASK)
    image.removeItem(COSName.SMASK)
    try {
      return PDImageXObject(PDStream(image), null).getImage(null, subsampling)
    } finally {
      if (softMask != null) image.setItem(COSName.SMASK, softMask)
    }
  }

  /** Flate for an unfiltered image stream, through a scratch file; kept only when under the ratio. */
  private fun deflate(image: COSStream, tempDir: File): Boolean {
    val old = image.length
    if (old <= 0) return false
    tempDir.mkdirs()
    val scratch = File(tempDir, "deflate.bin")
    try {
      PdfBoxSupport.mapReadErrors {
        image.createRawInputStream().use { input ->
          DeflaterOutputStream(FileOutputStream(scratch)).use { input.copyTo(it) }
        }
      }
      if (scratch.length() >= old * REPLACE_RATIO) return false
      PdfBoxSupport.mapSaveErrors {
        FileInputStream(scratch).use { input -> image.createRawOutputStream().use { input.copyTo(it) } }
      }
      image.setItem(COSName.FILTER, COSName.FLATE_DECODE)
      image.removeItem(COSName.DECODE_PARMS)
      return true
    } finally {
      scratch.delete()
    }
  }

  /**
   * [compress] for job [jobId]: [fileUri] must be a file of that job's workspace (anything else →
   * ERR_PERMISSION_DENIED); the output (`out-compressed.pdf`) and PdfBox scratch files go into the
   * same workspace. Returns `{ uri, sizeBytes, imagesRecompressed }`.
   */
  fun compressInWorkspace(
    context: Context,
    jobId: String,
    fileUri: String,
    levelKey: String,
    control: JobControl,
  ): Map<String, Any?> {
    if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
    val level = CompressLevels.of(levelKey)
    val source = ToolFiles.workspaceFile(context, Uri.parse(fileUri))
    val dir = source.parentFile ?: throw PermissionDeniedException()
    if (dir.name != jobId) throw PermissionDeniedException()
    if (!source.isFile) throw FileNotFoundCodedException()
    val target = File(dir, "out-compressed.pdf")
    val tempDir = File(dir, "pdfbox-compress")
    try {
      val replaced = compress(source, target, level, control, tempDir)
      return mapOf("uri" to Uri.fromFile(target).toString(), "sizeBytes" to target.length(), "imagesRecompressed" to replaced)
    } finally {
      tempDir.deleteRecursively()
    }
  }
}
