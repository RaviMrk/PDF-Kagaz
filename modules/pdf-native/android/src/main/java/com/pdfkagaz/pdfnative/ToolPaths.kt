package com.pdfkagaz.pdfnative

/**
 * Pure path rules for the private tool workspace (cacheDir/tools/<jobId>/…, never shared) and for
 * publishing tool outputs without overwriting anything.
 */
object ToolPaths {
  /** cacheDir/<DIR>/<jobId>/ holds staged inputs and outputs of one tool job. */
  const val DIR = "tools"

  /** cacheDir/<THUMB_DIR> holds page thumbnails of tool inputs. */
  const val THUMB_DIR = "tool-thumbs"

  private val JOB_ID = Regex("^[a-z0-9-]{1,64}$")
  private val LEFTOVER_PART = Regex("^\\..+\\.pdf\\.part$")
  private val CONTROL_CHARS = Regex("[\\u0000-\\u001f\\u007f]")

  fun isValidJobId(id: String): Boolean = JOB_ID.matches(id)

  /** True for a file strictly inside [toolsRoot]/<job>/ (not the root, a job dir, or deeper). */
  fun isWorkspaceFile(toolsRoot: String, canonicalPath: String): Boolean {
    val prefix = toolsRoot.trimEnd('/') + "/"
    if (!canonicalPath.startsWith(prefix)) return false
    val segments = canonicalPath.substring(prefix.length).split('/')
    if (segments.size != 2) return false
    val (job, name) = segments
    return isValidJobId(job) && name.isNotEmpty() && name != "." && name != ".."
  }

  /** The hidden sibling a file is written to before it is renamed into place. */
  fun partName(name: String): String = ".$name.part"

  /** A part file left behind by an interrupted publish. */
  fun isLeftoverPart(name: String): Boolean = LEFTOVER_PART.matches(name)

  /** [name], or "a (2).pdf"…, skipping names that exist or whose part file is being written. */
  fun uniqueTarget(name: String, taken: (String) -> Boolean): String =
    FileNames.uniqueName(name) { taken(it) || taken(partName(it)) }

  /** Drops C0 control characters and DEL, so a stray one does not fail the name check. */
  fun cleanOutputName(name: String): String = name.replace(CONTROL_CHARS, "")
}
