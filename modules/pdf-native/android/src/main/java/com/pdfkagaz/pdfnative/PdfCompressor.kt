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
 * side, no /Decode, /Mask or /ImageMask. JPX, JBIG2, CCITT, CMYK, Indexed, masks and inline images
 * are left alone. An image's /SMask is kept as it is. A stream is replaced only when the new one is
 * under [REPLACE_RATIO] of the old; an unfiltered image stream gets Flate instead. The full rewrite
 * on save drops unreferenced objects (and the dropped thumbnails). Disk work: call on Dispatchers.IO.
 */
object PdfCompressor {
  const val MIN_SIDE = 64
  const val REPLACE_RATIO = 0.9

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
        if (PdfBoxSupport.mapReadErrors { replace(image, level, tempDir) }) replaced += 1
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

  private fun replace(image: COSStream, level: CompressLevels.Level, tempDir: File): Boolean {
    val filters = filtersOf(image) ?: return false
    if (filters.isEmpty()) return deflate(image, tempDir)
    if (!isEligible(image, filters)) return false
    val jpeg = reencode(image, filters.single(), level) ?: return false
    if (jpeg.size >= image.length * REPLACE_RATIO) return false
    PdfBoxSupport.mapSaveErrors {
      image.createRawOutputStream().use { it.write(jpeg.bytes) }
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
    return isGrayOrRgb(image.getDictionaryObject(COSName.COLORSPACE))
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
    val w = image.getInt(COSName.WIDTH)
    val h = image.getInt(COSName.HEIGHT)
    val (tw, th) = CompressLevels.targetSize(w, h, level.maxLongSidePx)
    val subsampling = CompressLevels.subsamplingFor(w, h, maxOf(tw, th))
    var bitmap: Bitmap? = null
    try {
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
