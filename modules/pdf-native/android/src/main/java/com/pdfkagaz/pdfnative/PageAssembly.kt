package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.cos.COSArray
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import java.io.File
import java.util.Collections
import java.util.IdentityHashMap
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** One page of an output: page [page] (0-based) of input [input], turned by [rotate] more degrees (0/90/180/270). */
data class PageRef(val input: Int, val page: Int, val rotate: Int)

/**
 * Merge, split and organise with PdfBox: each output is a list of [PageRef]s into the inputs.
 * Inputs are opened once (mixed memory, scratch files in the job workspace) and stay open until
 * every output is saved, because imported pages keep referring to their resources. Outlines, forms
 * (widgets) and links are dropped, like the pdf-lib path. Errors are coded and carry no names or
 * paths. Disk work: call on Dispatchers.IO.
 */
object PageAssembly {
  const val MAX_REFS = 10_000

  private val ROTATIONS = setOf(0, 90, 180, 270)
  private val LINK = COSName.getPDFName("Link")
  private val WIDGET = COSName.getPDFName("Widget")
  private val BEADS = COSName.getPDFName("B")

  /**
   * Parses `[[{"i":input,"p":page,"r":rotate},…],…]` (one array per output). A negative index, a
   * rotation other than 0/90/180/270, no output, an empty output, more than [MAX_REFS] refs in all
   * or malformed JSON → ERR_INVALID_NAME.
   */
  fun parseOutputs(json: String): List<List<PageRef>> {
    val outputs = try {
      JSONArray(json)
    } catch (_: JSONException) {
      throw InvalidNameException()
    }
    if (outputs.length() == 0) throw InvalidNameException()
    var total = 0
    return (0 until outputs.length()).map { k ->
      val refs = outputs.optJSONArray(k) ?: throw InvalidNameException()
      if (refs.length() == 0) throw InvalidNameException()
      total += refs.length()
      if (total > MAX_REFS) throw InvalidNameException()
      (0 until refs.length()).map { j ->
        val ref = refs.optJSONObject(j) ?: throw InvalidNameException()
        val pageRef = PageRef(intOf(ref, "i"), intOf(ref, "p"), intOf(ref, "r"))
        if (pageRef.input < 0 || pageRef.page < 0 || pageRef.rotate !in ROTATIONS) throw InvalidNameException()
        pageRef
      }
    }
  }

  private fun intOf(ref: JSONObject, key: String): Int {
    val value = ref.opt(key) as? Number ?: throw InvalidNameException()
    val d = value.toDouble()
    if (d != Math.floor(d) || d < Int.MIN_VALUE || d > Int.MAX_VALUE) throw InvalidNameException()
    return d.toInt()
  }

  /**
   * Writes output k as `<outDir>/out-native-<k + 1>.pdf` (through a part file) and returns the
   * files in order. [control] is checked and progress reported per page; a cancel or any failure
   * removes every output this call wrote. A ref to an input or page that does not exist →
   * ERR_INVALID_NAME.
   */
  fun assemble(
    inputs: List<File>,
    outputs: List<List<PageRef>>,
    outDir: File,
    control: JobControl,
    tempDir: File,
  ): List<File> {
    if (inputs.isEmpty() || outputs.isEmpty() || outputs.any { it.isEmpty() }) throw InvalidNameException()
    val refCount = outputs.sumOf { it.size }
    if (refCount > MAX_REFS) throw InvalidNameException()
    if (outputs.any { refs -> refs.any { it.input !in inputs.indices || it.page < 0 || it.rotate !in ROTATIONS } }) {
      throw InvalidNameException()
    }
    val docs = ArrayList<PDDocument>(inputs.size)
    val written = ArrayList<File>(outputs.size)
    var done = false
    try {
      for ((i, input) in inputs.withIndex()) {
        control.check()
        docs += PdfBoxSupport.open(input, null, File(tempDir, "in-$i"))
      }
      if (outputs.any { refs -> refs.any { it.page >= docs[it.input].numberOfPages } }) throw InvalidNameException()
      // Each page counts once when imported and once when its output is saved.
      val units = refCount * 2.0
      var finished = 0
      val outTemp = File(tempDir, "out").apply { mkdirs() }
      for ((k, refs) in outputs.withIndex()) {
        val target = File(outDir, "out-native-${k + 1}.pdf")
        PDDocument(MemoryUsageSetting.setupMixed(PdfBoxSupport.MAIN_MEMORY_BYTES).setTempDir(outTemp)).use { out ->
          val seen: MutableSet<COSDictionary> = Collections.newSetFromMap(IdentityHashMap())
          for (ref in refs) {
            control.check()
            PdfBoxSupport.mapSaveErrors { importPage(out, docs[ref.input].getPage(ref.page), ref.rotate, seen) }
            finished += 1
            control.progress(finished / units)
          }
          control.check()
          PdfBoxSupport.saveTo(out, target)
          written += target
          finished += refs.size
          control.progress(finished / units)
        }
      }
      done = true
      return written
    } finally {
      for (doc in docs) {
        try {
          doc.close()
        } catch (_: Exception) {
          // Read-only inputs: nothing to lose.
        }
      }
      if (!done) for (file in written) file.delete()
    }
  }

  /**
   * Imports [page] into [out]; a page already imported into this output comes from a fresh copy of
   * its dictionary, so the duplicates are independent. Rotation is the page's own plus [rotate].
   */
  private fun importPage(out: PDDocument, page: PDPage, rotate: Int, seen: MutableSet<COSDictionary>) {
    val source = if (seen.add(page.cosObject)) page else PDPage(COSDictionary(page.cosObject))
    val imported = out.importPage(source)
    imported.rotation = (page.rotation + rotate) % 360
    val dict = imported.cosObject
    // Article beads and structure entries point into the source's catalog, which is not copied.
    dict.removeItem(BEADS)
    dict.removeItem(COSName.STRUCT_PARENTS)
    dropLinksAndForms(dict)
  }

  /**
   * Replaces the page's annotation array with one without links and form widgets. The others are
   * kept without their /P back-reference, which would otherwise pull the source page (and its
   * page tree) into the output. Only the open, never-saved inputs' annotations lose /P.
   */
  private fun dropLinksAndForms(page: COSDictionary) {
    val annots = page.getDictionaryObject(COSName.ANNOTS) as? COSArray
    if (annots == null) {
      page.removeItem(COSName.ANNOTS)
      return
    }
    val kept = COSArray()
    for (k in 0 until annots.size()) {
      val annot = annots.getObject(k) as? COSDictionary ?: continue
      val subtype = annot.getCOSName(COSName.SUBTYPE)
      if (subtype == LINK || subtype == WIDGET) continue
      annot.removeItem(COSName.P)
      kept.add(annots.get(k))
    }
    if (kept.size() == 0) page.removeItem(COSName.ANNOTS) else page.setItem(COSName.ANNOTS, kept)
  }

  /**
   * [assemble] for job [jobId]: [inputUris] must be files of that job's workspace (anything else →
   * ERR_PERMISSION_DENIED); outputs and PdfBox scratch files go into the same workspace. Returns
   * `{ uri, sizeBytes }` per output, in order.
   */
  fun assembleInWorkspace(
    context: Context,
    jobId: String,
    inputUris: List<String>,
    outputsJson: String,
    control: JobControl,
  ): List<Map<String, Any?>> {
    if (!ToolPaths.isValidJobId(jobId) || inputUris.isEmpty()) throw InvalidNameException()
    val outputs = parseOutputs(outputsJson)
    val inputs = inputUris.map { uri ->
      val file = ToolFiles.workspaceFile(context, Uri.parse(uri))
      if (file.parentFile?.name != jobId) throw PermissionDeniedException()
      if (!file.isFile) throw FileNotFoundCodedException()
      file
    }
    val dir = inputs[0].parentFile ?: throw PermissionDeniedException()
    val tempDir = File(dir, "pdfbox-assemble")
    try {
      return assemble(inputs, outputs, dir, control, tempDir).map {
        mapOf("uri" to Uri.fromFile(it).toString(), "sizeBytes" to it.length())
      }
    } finally {
      tempDir.deleteRecursively()
    }
  }
}
