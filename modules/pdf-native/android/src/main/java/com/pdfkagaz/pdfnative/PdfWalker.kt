package com.pdfkagaz.pdfnative

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.InvalidPathException

/** A PDF found by [PdfWalker]; [relDir] is its folder relative to the walk root ('' for the root). */
data class FoundPdf(val file: File, val relDir: String)

/**
 * Iterative depth-first walk over java.io. Applies [ScanRules], never follows symlinks and
 * tracks canonical paths so loops terminate. Unreadable folders are skipped.
 */
class PdfWalker(
  private val onProgress: (scannedFolders: Int, found: Int) -> Unit = { _, _ -> },
) {
  fun walk(root: File): List<FoundPdf> {
    if (!root.isDirectory) return emptyList()
    val found = ArrayList<FoundPdf>()
    val visited = HashSet<String>()
    val stack = ArrayDeque<Pair<File, String>>()
    stack.addLast(root to "")
    var scannedFolders = 0
    while (stack.isNotEmpty()) {
      val (dir, relDir) = stack.removeLast()
      if (!visited.add(canonical(dir))) continue
      val children = dir.listFiles() ?: continue
      scannedFolders++
      for (child in children) {
        if (isSymlink(child)) continue
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

  /** PDFs directly inside [dir] (non-recursive); [relDir] is copied into each result. */
  fun listDir(dir: File, relDir: String = ""): List<FoundPdf> {
    val children = dir.listFiles() ?: return emptyList()
    return children
      .filter { ScanRules.isPdf(it.name) && !isSymlink(it) && it.isFile }
      .map { FoundPdf(it, relDir) }
  }

  private fun canonical(dir: File): String =
    try {
      dir.canonicalPath
    } catch (e: IOException) {
      dir.absolutePath
    }

  private fun isSymlink(file: File): Boolean =
    try {
      Files.isSymbolicLink(file.toPath())
    } catch (e: InvalidPathException) {
      true
    }
}
