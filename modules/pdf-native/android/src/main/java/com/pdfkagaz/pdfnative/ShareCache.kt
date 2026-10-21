package com.pdfkagaz.pdfnative

/**
 * Naming and eviction for cacheDir/share: one hashed directory per shared source, holding a copy
 * under the source's display name (what the recipient shows). Same limits as [ReaderCache].
 */
object ShareCache {
  const val DIR = "share"
  const val PART_SUFFIX = ".part"
  private const val FALLBACK_NAME = "document.pdf"
  private val HASH = Regex("[0-9a-f]{40}")

  fun dirNameFor(uri: String, sizeBytes: Long, modifiedAt: Long): String = ThumbKey.of(uri, sizeBytes, modifiedAt, 0, 0)

  /** The display name, or "document.pdf" when it is empty or not a plain file name. */
  fun fileNameFor(displayName: String): String =
    if (displayName.isBlank() || '/' in displayName || displayName == "." || displayName == "..") FALLBACK_NAME else displayName

  /** Partial copies, then the oldest copies beyond [ReaderCache.MAX_FILES] / [ReaderCache.MAX_BYTES]. */
  fun toDelete(entries: List<CacheEntry>, keep: String): List<String> =
    ReaderCache.toDelete(entries, keep, isCopy = { HASH.matches(it) })
}
