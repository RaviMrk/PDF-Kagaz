package com.pdfkagaz.pdfnative

import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** A PDF found by [PdfWalker]; [relDir] is its folder relative to the walk root ('' for the root). */
data class FoundPdf(val file: File, val relDir: String)

/**
 * Depth-first walk over java.io (API 24-safe: no java.nio.file). Applies [ScanRules], never
 * follows symlinks and tracks canonical paths so loops terminate. Folders that cannot be listed
 * are skipped but recorded in [failedDirs] (rule-skipped dirs and symlinks are not), so callers
 * never treat their rows as deleted.
 *
 * With [parallelism] > 1, folders are listed on that many threads: on Android every readdir of
 * shared storage is a FUSE round trip into MediaProvider (tens of ms each), so listing is
 * latency-bound and sibling folders are listed concurrently. Results are sorted by path, so the
 * output does not depend on thread timing. [onProgress] is called under a lock, one call at a time.
 */
class PdfWalker(
  private val lister: (File) -> Array<File>? = { it.listFiles() },
  private val onProgress: (scannedFolders: Int, found: Int) -> Unit = { _, _ -> },
  private val parallelism: Int = 1,
) {
  private val _failedDirs = ArrayList<File>()

  /** Directories the last [walk] could not list. */
  val failedDirs: List<File> get() = _failedDirs

  fun walk(root: File): List<FoundPdf> {
    _failedDirs.clear()
    if (!root.isDirectory) return emptyList()
    val state = WalkState()
    if (parallelism <= 1) {
      val stack = ArrayDeque<Pair<File, String>>()
      stack.addLast(root to "")
      while (stack.isNotEmpty()) {
        val (dir, relDir) = stack.removeLast()
        visit(dir, relDir, state) { child, childRel -> stack.addLast(child to childRel) }
      }
    } else {
      walkInParallel(root, state)
    }
    _failedDirs.addAll(state.failed)
    return state.found.sortedBy { it.file.path }
  }

  private fun walkInParallel(root: File, state: WalkState) {
    val pool = Executors.newFixedThreadPool(parallelism)
    val pending = AtomicInteger(0)
    val done = CountDownLatch(1)
    val error = AtomicReference<Throwable?>(null)
    fun submit(dir: File, relDir: String) {
      pending.incrementAndGet()
      pool.execute {
        try {
          if (error.get() == null) visit(dir, relDir, state, ::submit)
        } catch (t: Throwable) {
          error.compareAndSet(null, t)
        } finally {
          if (pending.decrementAndGet() == 0) done.countDown()
        }
      }
    }
    try {
      submit(root, "")
      done.await()
    } finally {
      pool.shutdownNow()
    }
    error.get()?.let { throw it }
  }

  private class WalkState {
    val found = ConcurrentLinkedQueue<FoundPdf>()
    val failed = ConcurrentLinkedQueue<File>()
    val visited: MutableSet<String> = ConcurrentHashMap.newKeySet()
    val progressLock = Any()
    var scannedFolders = 0
    var foundCount = 0
  }

  /** Lists one folder: records its PDFs and hands every subfolder to [enqueue]. */
  private fun visit(dir: File, relDir: String, state: WalkState, enqueue: (File, String) -> Unit) {
    val canonicalDir = canonical(dir)
    if (canonicalDir == null) {
      state.failed.add(dir)
      return
    }
    if (!state.visited.add(canonicalDir.path)) return
    val children = lister(dir)
    if (children == null) {
      state.failed.add(dir)
      return
    }
    var foundHere = 0
    for (child in children) {
      if (isSymlink(child, canonicalDir)) continue
      val name = child.name
      if (child.isDirectory) {
        val childRel = if (relDir.isEmpty()) name else "$relDir/$name"
        if (!ScanRules.shouldSkipDir(name, childRel)) enqueue(child, childRel)
      } else if (ScanRules.isPdf(name) && child.isFile) {
        state.found.add(FoundPdf(child, relDir))
        foundHere++
      }
    }
    synchronized(state.progressLock) {
      state.scannedFolders++
      state.foundCount += foundHere
      onProgress(state.scannedFolders, state.foundCount)
    }
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
