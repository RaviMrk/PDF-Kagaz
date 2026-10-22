package com.pdfkagaz.pdfnative

import java.io.File

/**
 * A free target name in [dir] and its hidden part file, created empty and atomically
 * (`createNewFile`): an existing file is never opened for writing. Existing names, in-flight part
 * files and names already tried all count as taken. Hold [AppFolderLock] from [claim] to
 * [commit] / [release]; blocking.
 */
class PartClaim private constructor(private val dir: File, private val pick: ((String) -> Boolean) -> String) {
  private val skipped = HashSet<String>()

  var name: String = ""
    private set

  var part: File = dir
    private set

  private fun taken(n: String) = n in skipped || isTaken(dir, n)

  /**
   * Renames the part to [name], or to the next free name when another app created [name]
   * meanwhile; null when the rename fails. Residual race: another app creating the target between
   * the check and renameTo is replaced by the rename — Os.link (fails on EEXIST) is not reliable on
   * Android's FUSE shared storage, so this is accepted; in-process writers are serialised by
   * [AppFolderLock].
   */
  fun commit(): File? {
    if (File(dir, name).exists()) {
      skipped.add(name)
      name = pick(::taken)
    }
    val target = File(dir, name)
    return if (part.renameTo(target)) target else null
  }

  /** Deletes the part file if it is still there (after a failure or cancellation). */
  fun release() {
    if (part.exists()) part.delete()
  }

  companion object {
    /** [name] exists in [dir] or its part file is being written there (a publish, move or duplicate in flight). */
    fun isTaken(dir: File, name: String): Boolean = File(dir, name).exists() || File(dir, ToolPaths.partName(name)).exists()

    /** [pick] gets the "taken" predicate and returns a candidate name (e.g. [ToolPaths.uniqueTarget]). */
    fun claim(dir: File, pick: ((String) -> Boolean) -> String): PartClaim =
      PartClaim(dir, pick).apply {
        while (true) {
          name = pick(::taken)
          part = File(dir, ToolPaths.partName(name))
          if (part.createNewFile()) break
          skipped.add(name)
        }
      }
  }
}
