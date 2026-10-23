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

  /** Image sessions are workspaces whose id starts with "img-" (picked or scanned sources). */
  fun isImageSessionId(id: String): Boolean = isValidJobId(id) && id.startsWith("img-")

  /** Imported source number [index] of an image session. */
  fun sourceName(index: Int): String = "src-$index"

  /** Prepared JPEG page number [index] of an image job. */
  fun pageName(index: Int): String = "page-$index.jpg"

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

  /** Bytes a counter (" (999)") and the part wrapping ('.' + ".part") may add to a name. */
  private const val HEADROOM_BYTES = 6 + 6

  /** Longest base (UTF-8 bytes) of a ".pdf" name that [fitName] keeps. */
  const val MAX_BASE_BYTES = FileNames.MAX_NAME_BYTES - HEADROOM_BYTES - 4

  /**
   * [name] with its base cut (whole code points, extension kept) so that the name with a counter
   * up to " (999)" and its part file still fit [FileNames.MAX_NAME_BYTES]; short names unchanged.
   */
  fun fitName(name: String): String {
    val dot = name.lastIndexOf('.')
    val (base, ext) = if (dot > 0) name.substring(0, dot) to name.substring(dot) else name to ""
    val budget = FileNames.MAX_NAME_BYTES - HEADROOM_BYTES - utf8Size(ext)
    if (utf8Size(base) <= budget) return name
    val out = StringBuilder()
    var used = 0
    var i = 0
    while (i < base.length) {
      val end = i + Character.charCount(base.codePointAt(i))
      val size = utf8Size(base.substring(i, end))
      if (used + size > budget) break
      out.append(base, i, end)
      used += size
      i = end
    }
    return out.toString().trimEnd() + ext
  }

  private fun utf8Size(s: String) = s.toByteArray(Charsets.UTF_8).size
}
