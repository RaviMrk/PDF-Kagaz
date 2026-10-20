package com.pdfkagaz.pdfnative

import java.io.File
import java.io.IOException

/** A PDF found by [PdfWalker]; [relDir] is its folder relative to the walk root ('' for the root). */
data class FoundPdf(val file: File, val relDir: String)

/**
 * Iterative depth-first walk over java.io (API 24-safe: no java.nio.file). Applies [ScanRules],
 * never follows symlinks and tracks canonical paths so loops terminate. Folders that cannot be
 * listed are skipped but recorded in [failedDirs] (rule-skipped dirs and symlinks are not), so
 * callers never treat their rows as deleted.
 */
class PdfWalker(
  private val lister: (File) -> Array<File>? = { it.listFiles() },
  private val onProgress: (scannedFolders: Int, found: Int) -> Unit = { _, _ -> },
) {
  private val _failedDirs = ArrayList<File>()

  /** Directories the last [walk] could not list. */
  val failedDirs: List<File> get() = _failedDirs

  fun walk(root: File): List<FoundPdf> {
    _failedDirs.clear()
    if (!root.isDirectory) return emptyList()
    val found = ArrayList<FoundPdf>()
    val visited = HashSet<String>()
    val stack = ArrayDeque<Pair<File, String>>()
    stack.addLast(root to "")
    var scannedFolders = 0
    while (stack.isNotEmpty()) {
      val (dir, relDir) = stack.removeLast()
      val canonicalDir = canonical(dir)
      if (canonicalDir == null) {
        _failedDirs.add(dir)
        continue
      }
      if (!visited.add(canonicalDir.path)) continue
      val children = lister(dir)
      if (children == null) {
        _failedDirs.add(dir)
        continue
      }
      scannedFolders++
      for (child in children) {
        if (isSymlink(child, canonicalDir)) continue
        val name = child.name
        if (child.isDirectory) {
          val childRel = if (relDir.isEmpty()) name else "$relDir/$name"
          if (!ScanRules.shouldSkipDir(name, childRel)) stack.addLast(child to childRel)
        } else if (ScanRules.isPdf(name) && child.isFile) {
          found.add(FoundPdf(child, relDir))
        }
      }
      onProgress(scannedFolders, found.size)
    }
    return found
  }

  /**
   * PDFs directly inside [dir] (non-recursive); [relDir] is copied into each result.
   * Returns null when [dir] cannot be listed (not a directory, I/O or permission failure),
   * so callers can tell "unreadable" from "empty".
   */
  fun listDir(dir: File, relDir: String = ""): List<FoundPdf>? {
    val children = dir.listFiles() ?: return null
    val canonicalDir = canonical(dir) ?: return null
    return children
      .filter { ScanRules.isPdf(it.name) && !isSymlink(it, canonicalDir) && it.isFile }
      .map { FoundPdf(it, relDir) }
  }

  private fun canonical(file: File): File? =
    try {
      file.canonicalFile
    } catch (e: IOException) {
      null
    }

  /** A child is a symlink when its canonical path is not "<canonical parent>/<name>". */
  private fun isSymlink(child: File, canonicalParent: File): Boolean {
    val canonicalChild = canonical(child) ?: return true
    return canonicalChild != File(canonicalParent, child.name)
  }
}
