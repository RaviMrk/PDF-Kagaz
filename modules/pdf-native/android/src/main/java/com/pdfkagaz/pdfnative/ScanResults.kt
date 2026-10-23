package com.pdfkagaz.pdfnative

/** Pure rules for the page images an ML Kit document scan returns. */
object ScanResults {
  /** ReaderFiles.DIR (that class is not pure, so the name is repeated here). */
  private const val READER_DIR = "reader"

  /** Cache folders this app owns; a scanner page inside them is never ours to delete. */
  private val OWN_CACHE_DIRS = listOf(ToolPaths.DIR, ToolPaths.THUMB_DIR, READER_DIR, ShareCache.DIR)

  /** Scanner page uris in order: blanks dropped, distinct, the first [max]. */
  fun pageUris(uris: List<String>, max: Int): List<String> =
    uris.filter { it.isNotBlank() }.distinct().take(max.coerceAtLeast(0))

  /**
   * True for a file strictly inside [cacheDir] (where the scanner writes its pages) that is not in
   * one of this app's own cache folders, so it may be deleted once imported.
   */
  fun isOwnScannerFile(cacheDir: String, canonicalPath: String): Boolean {
    val root = cacheDir.trimEnd('/')
    val prefix = "$root/"
    if (!canonicalPath.startsWith(prefix) || canonicalPath.length == prefix.length) return false
    return OWN_CACHE_DIRS.none { dir -> canonicalPath == "$prefix$dir" || canonicalPath.startsWith("$prefix$dir/") }
  }
}
