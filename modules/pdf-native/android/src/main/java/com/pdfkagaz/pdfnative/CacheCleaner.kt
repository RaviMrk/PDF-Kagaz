package com.pdfkagaz.pdfnative

import java.io.File

/**
 * What "Clear cache" may delete in cacheDir: thumbnails, reader copies and share copies.
 * Everything else (tools/ job workspaces and image sessions, tool-thumbs/, the ML Kit scanner
 * folder) is never touched.
 */
object CacheCleaner {
  val CLEARED_DIRS = listOf("thumbs", "reader", "share")
  const val SHARE_MIN_AGE_MS = 600_000L

  /** [relativePath] is relative to cacheDir, with '/' separators. */
  fun shouldDelete(relativePath: String, lastModifiedMs: Long, nowMs: Long): Boolean {
    val parts = relativePath.split('/')
    if (parts.size < 2 || parts.any { it.isEmpty() || it == ".." || it == "." }) return false
    return when (parts[0]) {
      "thumbs", "reader" -> true
      "share" -> nowMs - lastModifiedMs >= SHARE_MIN_AGE_MS
      else -> false
    }
  }

  /** A reader copy touched in the last 10 minutes may still be open in the reader. */
  fun keepRecentReader(relativePath: String, lastModifiedMs: Long, nowMs: Long): Boolean =
    relativePath.startsWith("reader/") && nowMs - lastModifiedMs < SHARE_MIN_AGE_MS

  /** Deletes the eligible files under [cacheDir] and returns the bytes freed. Per-file errors are skipped. */
  fun clear(cacheDir: File, nowMs: Long): Long {
    var freed = 0L
    for (name in CLEARED_DIRS) {
      val dir = File(cacheDir, name)
      if (!dir.isDirectory) continue
      freed += clearDir(dir, name, nowMs)
    }
    return freed
  }

  private fun clearDir(dir: File, relative: String, nowMs: Long): Long {
    var freed = 0L
    val children = dir.listFiles() ?: return 0L
    for (child in children) {
      val childRelative = "$relative/${child.name}"
      // Symlinks are never followed.
      if (child.isDirectory && !java.nio.file.Files.isSymbolicLink(child.toPath())) {
        freed += clearDir(child, childRelative, nowMs)
        child.delete() // Only succeeds for a now-empty sub-directory.
        continue
      }
      try {
        val modified = child.lastModified()
        if (!shouldDelete(childRelative, modified, nowMs) || keepRecentReader(childRelative, modified, nowMs)) continue
        val length = child.length()
        if (child.delete()) freed += length
      } catch (_: SecurityException) {
        // Skipped.
      }
    }
    return freed
  }
}
