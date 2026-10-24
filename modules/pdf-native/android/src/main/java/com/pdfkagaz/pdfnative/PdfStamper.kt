package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.util.Matrix
import java.io.File
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** One stamp of a spec (see src/services/pdf/stamp.ts for the JSON shape). */
sealed class Stamp {
  abstract val pages: List<Int>?

  /** Anchored at [position] [marginPt] inside the edges, or centred at fractions ([cx], [cy]) of the page as seen. */
  data class Image(
    val png: String,
    override val pages: List<Int>?,
    val position: String?,
    val marginPt: Double,
    val cx: Double,
    val cy: Double,
    val widthFrac: Double,
    val angle: Double,
    val opacity: Double,
  ) : Stamp()

  data class Text(
    val template: String,
    val start: Int,
    override val pages: List<Int>?,
    val position: String,
    val fontSize: Double,
    val marginPt: Double,
  ) : Stamp()
}

/**
 * Watermarks, page numbers and signatures with PdfBox: the twin of `applyStamps` (stamp.ts), with
 * the same geometry ([StampGeometry]), page selection and numbering. Errors are coded and carry no
 * names or paths. Disk work: call on Dispatchers.IO.
 */
object PdfStamper {
  const val FALLBACK_TEMPLATE = "{n} / {total}"
  const val MAX_STAMPS = 1_000

  private val CP1252_EXTRAS = setOf(
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
  )

  fun labelFor(template: String, n: Int, total: Int): String =
    template.replace("{n}", n.toString()).replace("{total}", total.toString())

  /** Every character in WinAnsiEncoding (no-break space and soft hyphen refused), like stamp.ts. */
  fun isWinAnsi(text: String): Boolean {
    var i = 0
    while (i < text.length) {
      val c = text.codePointAt(i)
      val ok = c in 0x20..0x7e || (c in 0xa1..0xff && c != 0xad) || c in CP1252_EXTRAS
      if (!ok) return false
      i += Character.charCount(c)
    }
    return true
  }

  /** 1-based pages that exist, sorted, once each; null = every page. */
  fun stampedPages(pages: List<Int>?, pageCount: Int): List<Int> =
    pages?.filter { it in 1..pageCount }?.distinct()?.sorted() ?: (1..pageCount).toList()

  /** Parses `{"stamps":[…]}`; malformed JSON, an unknown kind or a missing field → ERR_INVALID_NAME. */
  fun parseSpec(json: String): List<Stamp> =
    try {
      val stamps = JSONObject(json).getJSONArray("stamps")
      if (stamps.length() > MAX_STAMPS) throw InvalidNameException()
      (0 until stamps.length()).map { k -> parseStamp(stamps.getJSONObject(k)) }
    } catch (_: JSONException) {
      throw InvalidNameException()
    }

  private fun parseStamp(o: JSONObject): Stamp {
    val pages = if (o.isNull("pages")) null else o.getJSONArray("pages").let { a -> (0 until a.length()).map { intOf(a.get(it)) } }
    return when (o.getString("kind")) {
      "image" -> {
        val anchor = o.getJSONObject("anchor")
        val position = if (anchor.has("position")) anchor.getString("position") else null
        if (position != null && position !in StampGeometry.POSITIONS) throw InvalidNameException()
        Stamp.Image(
          png = o.getString("png"),
          pages = pages,
          position = position,
          marginPt = if (position != null) finite(anchor.getDouble("marginPt")) else 0.0,
          cx = if (position == null) finite(anchor.getDouble("cx")) else 0.0,
          cy = if (position == null) finite(anchor.getDouble("cy")) else 0.0,
          widthFrac = finite(o.getDouble("widthFrac")).also { if (it <= 0) throw InvalidNameException() },
          angle = finite(o.getDouble("angle")),
          opacity = finite(o.getDouble("opacity")).coerceIn(0.0, 1.0),
        )
      }
      "text" -> {
        val position = o.getString("position")
        if (position !in StampGeometry.POSITIONS) throw InvalidNameException()
        Stamp.Text(
          template = o.getString("template"),
          start = intOf(o.get("start")),
          pages = pages,
          position = position,
          fontSize = finite(o.getDouble("fontSize")).also { if (it <= 0) throw InvalidNameException() },
          marginPt = finite(o.getDouble("marginPt")),
        )
      }
      else -> throw InvalidNameException()
    }
  }

  private fun finite(d: Double): Double = if (d.isFinite()) d else throw InvalidNameException()

  private fun intOf(value: Any?): Int {
    val d = (value as? Number)?.toDouble() ?: throw InvalidNameException()
    if (d != Math.floor(d) || d < Int.MIN_VALUE || d > Int.MAX_VALUE) throw InvalidNameException()
    return d.toInt()
  }

  /**
   * The PNG a `png` URI names: a file:// URI of a file in [workspace] itself, else
   * ERR_PERMISSION_DENIED; missing → ERR_FILE_NOT_FOUND.
   */
  private fun pngFile(uri: String, workspace: File): File {
    val parsed = Uri.parse(uri)
    val path = if (parsed.scheme == "file") parsed.path else null
    val file = path?.let { File(it).canonicalFile } ?: throw PermissionDeniedException()
    if (file.parentFile != workspace.canonicalFile) throw PermissionDeniedException()
    if (!file.isFile) throw FileNotFoundCodedException()
    return file
  }

  /**
   * Writes [source] with the stamps of [specJson] to [target] (through a part file). Image PNGs
   * must be files of [target]'s folder (the job workspace). [control] is checked before every
   * page and progress reported after it; on a cancel or failure [target] is not written.
   */
  fun stamp(source: File, target: File, specJson: String, control: JobControl, tempDir: File) {
    val stamps = parseSpec(specJson)
    val workspace = target.parentFile ?: throw PermissionDeniedException()
    val pngs = stamps.filterIsInstance<Stamp.Image>().map { it.png }.distinct().associateWith { pngFile(it, workspace) }
    control.check()
    PdfBoxSupport.open(source, null, tempDir).use { doc ->
      // Like loadPdf: an encrypted input is never stamped (owner restrictions are not bypassed).
      if (doc.isEncrypted) throw PdfEncryptedException()
      val pageCount = doc.numberOfPages
      val plans = stamps.map { it to stampedPages(it.pages, pageCount) }
      val units = plans.sumOf { it.second.size }.toDouble()
      val images = HashMap<String, PDImageXObject>()
      var done = 0
      for ((stamp, pages) in plans) {
        if (pages.isEmpty()) continue
        val image = (stamp as? Stamp.Image)?.let { s -> images.getOrPut(s.png) { embed(doc, pngs.getValue(s.png)) } }
        for ((index, number) in pages.withIndex()) {
          control.check()
          PdfBoxSupport.mapReadErrors {
            val page = doc.getPage(number - 1)
            when (stamp) {
              is Stamp.Image -> drawImage(doc, page, stamp, image!!)
              is Stamp.Text -> drawText(doc, page, stamp, stamp.start + index, stamp.start + pages.size - 1)
            }
          }
          done += 1
          control.progress(done / units * 0.9)
        }
      }
      control.check()
      PdfBoxSupport.saveTo(doc, target)
      control.progress(1.0)
    }
  }

  private fun embed(doc: PDDocument, file: File): PDImageXObject {
    val bitmap = BitmapFactory.decodeFile(file.path) ?: throw ImageInvalidException()
    try {
      return PdfBoxSupport.mapReadErrors { LosslessFactory.createFromImage(doc, bitmap) }
    } finally {
      bitmap.recycle()
    }
  }

  private fun boxOf(page: PDPage): PageBox {
    val crop = page.cropBox
    return PageBox(
      crop.lowerLeftX.toDouble(),
      crop.lowerLeftY.toDouble(),
      crop.width.toDouble(),
      crop.height.toDouble(),
      StampGeometry.normalizeRotation(page.rotation),
    )
  }

  private fun drawImage(doc: PDDocument, page: PDPage, stamp: Stamp.Image, image: PDImageXObject) {
    val box = boxOf(page)
    val seen = StampGeometry.visualSize(box)
    val width = stamp.widthFrac * seen.width
    val size = StampSize(width, width * image.height / image.width)
    val center = if (stamp.position != null) {
      StampGeometry.positionCenter(stamp.position, seen, StampGeometry.rotatedBounds(size.width, size.height, stamp.angle), stamp.marginPt)
    } else {
      StampCenter(stamp.cx * seen.width, stamp.cy * seen.height)
    }
    val at = StampGeometry.placeOnPage(box, center, size, stamp.angle)
    PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
      cs.saveGraphicsState()
      cs.setGraphicsStateParameters(PDExtendedGraphicsState().apply { nonStrokingAlphaConstant = stamp.opacity.toFloat() })
      cs.transform(Matrix.getRotateInstance(Math.toRadians(at.rotate), at.x.toFloat(), at.y.toFloat()))
      cs.drawImage(image, 0f, 0f, at.width.toFloat(), at.height.toFloat())
      cs.restoreGraphicsState()
    }
  }

  private fun drawText(doc: PDDocument, page: PDPage, stamp: Stamp.Text, n: Int, total: Int) {
    val template = if (isWinAnsi(stamp.template)) stamp.template else FALLBACK_TEMPLATE
    val label = labelFor(template, n, total)
    val font = PDType1Font.HELVETICA
    val size = StampSize(font.getStringWidth(label) / 1000.0 * stamp.fontSize, stamp.fontSize)
    val box = boxOf(page)
    val center = StampGeometry.positionCenter(stamp.position, StampGeometry.visualSize(box), size, stamp.marginPt)
    val at = StampGeometry.placeOnPage(box, center, size, 0.0)
    PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
      cs.beginText()
      cs.setNonStrokingColor(0f, 0f, 0f)
      cs.setFont(font, stamp.fontSize.toFloat())
      cs.setTextMatrix(Matrix.getRotateInstance(Math.toRadians(at.rotate), at.x.toFloat(), at.y.toFloat()))
      cs.showText(label)
      cs.endText()
    }
  }

  /**
   * [stamp] for job [jobId]: [fileUri] must be a file of that job's workspace (anything else →
   * ERR_PERMISSION_DENIED); writes `out-stamped.pdf` there. Returns `{ uri, sizeBytes }`.
   */
  fun stampInWorkspace(context: Context, jobId: String, fileUri: String, specJson: String, control: JobControl): Map<String, Any?> {
    if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
    val source = ToolFiles.workspaceFile(context, Uri.parse(fileUri))
    val dir = source.parentFile ?: throw PermissionDeniedException()
    if (dir.name != jobId) throw PermissionDeniedException()
    if (!source.isFile) throw FileNotFoundCodedException()
    val target = File(dir, "out-stamped.pdf")
    val tempDir = File(dir, "pdfbox-stamp")
    try {
      stamp(source, target, specJson, control, tempDir)
      return mapOf("uri" to Uri.fromFile(target).toString(), "sizeBytes" to target.length())
    } finally {
      tempDir.deleteRecursively()
    }
  }
}
