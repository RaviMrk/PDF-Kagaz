package com.pdfkagaz.pdfnative

import java.io.File
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors

/** A folder whose contents may have changed since the last scan; [pdfs] is empty when gone. */
data class DirChange(val uri: String, val exists: Boolean, val modifiedAt: Long, val pdfs: List<FoundPdf>)

/**
 * Pure decision logic of the quick scan (F-04). Folders are keyed by URI string; [toFile]
 * resolves one to a java.io.File (null → ignored). With [parallelism] > 1, candidates are checked
 * on that many threads (each stat of shared storage is a FUSE round trip); the result keeps
 * candidate order.
 */
class ChangedFolders(private val walker: PdfWalker = PdfWalker(), private val parallelism: Int = 1) {
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
    val candidates = LinkedHashSet<String>(known.keys).apply { addAll(hot) }.toList()
    val one = { uri: String -> checkOne(uri, known[uri], toFile, isMounted) }
    if (parallelism <= 1 || candidates.size < 2) return candidates.mapNotNull(one)
    // Each stat of shared storage is a FUSE round trip; check folders concurrently, keep order.
    val pool = Executors.newFixedThreadPool(minOf(parallelism, candidates.size))
    try {
      val futures = candidates.map { uri -> pool.submit(Callable { one(uri) }) }
      return futures.mapNotNull { future ->
        try {
          future.get()
        } catch (e: ExecutionException) {
          throw e.cause ?: e
        }
      }
    } finally {
      pool.shutdownNow()
    }
  }

  private fun checkOne(uri: String, stamp: Long?, toFile: (String) -> File?, isMounted: (File) -> Boolean): DirChange? {
    val dir = toFile(uri) ?: return null
    if (!isMounted(dir)) return null
    if (!dir.exists()) return if (stamp != null) DirChange(uri, false, 0L, emptyList()) else null
    val modifiedAt = dir.lastModified()
    if (stamp != null && stamp == modifiedAt) return null
    val pdfs = walker.listDir(dir) ?: return null
    return DirChange(uri, true, modifiedAt, pdfs)
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
