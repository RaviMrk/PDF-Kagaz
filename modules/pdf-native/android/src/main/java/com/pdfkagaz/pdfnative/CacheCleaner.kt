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

  /** Marks a copy as in use now, so the age rules keep it. */
  fun touch(file: File, nowMs: Long) {
    try {
      file.setLastModified(nowMs)
    } catch (_: SecurityException) {
      // Best effort.
    }
  }

  /** Deletes the eligible files under [cacheDir] and returns the bytes freed. Per-file errors are skipped. */
  fun clear(cacheDir: File, nowMs: Long): Long {
    var freed = 0L
    val base = try {
      cacheDir.canonicalPath
    } catch (_: java.io.IOException) {
      return 0L
    }
    for (name in CLEARED_DIRS) {
      val dir = File(cacheDir, name)
      // A symlinked or otherwise relocated top-level directory is never walked.
      val inside = try {
        dir.isDirectory && dir.canonicalPath == "$base/$name"
      } catch (_: java.io.IOException) {
        false
      }
      if (!inside) continue
      freed += if (name == "share") clearShare(dir, nowMs) else clearDir(dir, name, nowMs)
    }
    return freed
  }

  /** Each share/<hash> entry is judged as a unit by its newest mtime (reuse only touches the directory). */
  private fun clearShare(dir: File, nowMs: Long): Long {
    var freed = 0L
    for (entry in dir.listFiles() ?: return 0L) {
      if (java.nio.file.Files.isSymbolicLink(entry.toPath())) continue
      if (!shouldDelete("share/${entry.name}", newestMtime(entry), nowMs)) continue
      val bytes = sizeOf(entry)
      if (deleteTree(entry)) freed += bytes
    }
    return freed
  }

  private fun newestMtime(f: File): Long {
    var newest = f.lastModified()
    if (f.isDirectory && !java.nio.file.Files.isSymbolicLink(f.toPath())) {
      for (c in f.listFiles() ?: emptyArray()) newest = maxOf(newest, newestMtime(c))
    }
    return newest
  }

  private fun sizeOf(f: File): Long =
    if (java.nio.file.Files.isSymbolicLink(f.toPath())) 0L
    else if (f.isDirectory) (f.listFiles() ?: emptyArray()).sumOf { sizeOf(it) }
    else f.length()

  private fun deleteTree(f: File): Boolean {
    if (f.isDirectory && !java.nio.file.Files.isSymbolicLink(f.toPath())) {
      for (c in f.listFiles() ?: emptyArray()) deleteTree(c)
    }
    return f.delete()
  }

  private fun clearDir(dir: File, relative: String, nowMs: Long): Long {
    var freed = 0L
    val children = dir.listFiles() ?: return 0L
    for (child in children) {
      val childRelative = "$relative/${child.name}"
      val isLink = java.nio.file.Files.isSymbolicLink(child.toPath())
      if (child.isDirectory && !isLink) {
        freed += clearDir(child, childRelative, nowMs)
        child.delete() // Only succeeds for a now-empty sub-directory.
        continue
      }
      try {
        val modified = child.lastModified()
        if (!shouldDelete(childRelative, modified, nowMs) || keepRecentReader(childRelative, modified, nowMs)) continue
        val length = if (isLink) 0L else child.length()
        if (child.delete()) freed += length
      } catch (_: SecurityException) {
        // Skipped.
      }
    }
    return freed
  }
}
