package com.pdfkagaz.pdfnative

import java.io.File

/** A file in the reader copy cache (cacheDir/reader). */
data class CacheEntry(val name: String, val lastModified: Long, val sizeBytes: Long)

/** Naming and eviction rules for the cache copies the reader opens instead of content:// sources. */
object ReaderCache {
  const val MAX_FILES = 3
  const val MAX_BYTES = 300L * 1024 * 1024

  private const val PART_SUFFIX = ".part"
  private const val PDF_SUFFIX = ".pdf"

  /** A hashed name (never the source's display name) that changes whenever the source does. */
  fun fileNameFor(uri: String, sizeBytes: Long, modifiedAt: Long): String =
    "${ThumbKey.of(uri, sizeBytes, modifiedAt, 0, 0)}$PDF_SUFFIX"

  /**
   * The modification time to key thumbnails and the open renderer on. A copy directly in [readerDir]
   * gets 0: its name already hashes the source uri, size and mtime, and prepareReaderFile touches it
   * on every reuse (LRU), which must not change its keys.
   */
  fun stableModifiedAt(path: String, readerDir: String, modifiedAt: Long): Long =
    if (File(path).absoluteFile.parentFile == File(readerDir).absoluteFile) 0L else modifiedAt

  /** Providers that only expose OpenableColumns report 0: their copy cannot be trusted, recopy. */
  fun reusable(modifiedAt: Long): Boolean = modifiedAt > 0

  /**
   * Names to delete: every partial copy, then the oldest copies once keeping one more would reach
   * [maxFiles] or exceed [maxBytes] (both counting [keep], which is never deleted).
   */
  fun toDelete(
    entries: List<CacheEntry>,
    keep: String,
    maxFiles: Int = MAX_FILES,
    maxBytes: Long = MAX_BYTES,
  ): List<String> {
    val deleted = entries.filter { it.name.endsWith(PART_SUFFIX) }.map { it.name }.toMutableList()
    var keptCount = 1
    var keptBytes = entries.firstOrNull { it.name == keep }?.sizeBytes ?: 0L
    var full = false
    for (entry in entries.filter { it.name != keep && it.name.endsWith(PDF_SUFFIX) }.sortedByDescending { it.lastModified }) {
      if (!full && keptCount < maxFiles && keptBytes + entry.sizeBytes <= maxBytes) {
        keptCount++
        keptBytes += entry.sizeBytes
      } else {
        full = true
        deleted.add(entry.name)
      }
    }
    return deleted
  }
}
