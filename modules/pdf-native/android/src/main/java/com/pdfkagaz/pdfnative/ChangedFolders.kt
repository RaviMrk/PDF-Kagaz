package com.pdfkagaz.pdfnative

import java.io.File

/** A folder whose contents may have changed since the last scan; [pdfs] is empty when gone. */
data class DirChange(val uri: String, val exists: Boolean, val modifiedAt: Long, val pdfs: List<FoundPdf>)

/**
 * Pure decision logic of the quick scan (F-04). Folders are keyed by URI string; [toFile]
 * resolves one to a java.io.File (null → ignored).
 */
class ChangedFolders(private val walker: PdfWalker = PdfWalker()) {
  /**
   * Checks [known] (uri → stamped mtime) ∪ [hot]. Returns only folders that vanished (only if
   * known) or whose mtime differs / are unknown, with their PDFs listed non-recursively.
   * Folders on no mounted volume ([isMounted] false) and folders that cannot be listed are
   * skipped, never reported, so their indexed rows survive.
   */
  fun check(
    known: Map<String, Long>,
    hot: List<String>,
    toFile: (String) -> File?,
    isMounted: (File) -> Boolean,
  ): List<DirChange> {
    val candidates = LinkedHashSet<String>(known.keys).apply { addAll(hot) }
    val changes = ArrayList<DirChange>()
    for (uri in candidates) {
      val dir = toFile(uri) ?: continue
      if (!isMounted(dir)) continue
      val stamp = known[uri]
      if (!dir.exists()) {
        if (stamp != null) changes.add(DirChange(uri, false, 0L, emptyList()))
        continue
      }
      val modifiedAt = dir.lastModified()
      if (stamp != null && stamp == modifiedAt) continue
      val pdfs = walker.listDir(dir) ?: continue
      changes.add(DirChange(uri, true, modifiedAt, pdfs))
    }
    return changes
  }

  companion object {
    /**
     * Pairs the parallel arrays sent from JS (uris[i] was stamped with modifiedAts[i]) into the
     * [check] map, keeping file:// folders only (without a trailing slash).
     */
    fun knownStamps(uris: List<String>, modifiedAts: List<Double>): Map<String, Long> {
      require(uris.size == modifiedAts.size) { "uris and modifiedAts differ in length" }
      val known = LinkedHashMap<String, Long>()
      for (i in uris.indices) {
        if (uris[i].startsWith("file://")) known[uris[i].trimEnd('/')] = modifiedAts[i].toLong()
      }
      return known
    }
  }
}
