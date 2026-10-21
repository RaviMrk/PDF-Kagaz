package com.pdfkagaz.pdfnative

/** Pure file-name helpers for duplicate / move targets. The extension is the part after the last '.' (not a leading one). */
object FileNames {
  /** "a.pdf" → "a (copy).pdf", then "a (copy 2).pdf", "a (copy 3).pdf"… — the first one [exists] rejects. */
  fun duplicateName(name: String, exists: (String) -> Boolean): String {
    val (base, ext) = split(name)
    val first = "$base (copy)$ext"
    if (!exists(first)) return first
    var n = 2
    while (true) {
      val candidate = "$base (copy $n)$ext"
      if (!exists(candidate)) return candidate
      n++
    }
  }

  /** [name] itself when free, else "a (2).pdf", "a (3).pdf"… */
  fun uniqueName(name: String, exists: (String) -> Boolean): String {
    if (!exists(name)) return name
    val (base, ext) = split(name)
    var n = 2
    while (true) {
      val candidate = "$base ($n)$ext"
      if (!exists(candidate)) return candidate
      n++
    }
  }

  /**
   * A valid visible single-segment display name: non-blank, no '/', no NUL, no leading '.' (hidden
   * files are skipped by every scan) and at most [MAX_NAME_BYTES] bytes of UTF-8.
   */
  fun isValidName(name: String): Boolean =
    name.isNotBlank() &&
      '/' !in name &&
      '\u0000' !in name &&
      !name.startsWith(".") &&
      name.toByteArray(Charsets.UTF_8).size <= MAX_NAME_BYTES

  /** File-system name limit (ext4, f2fs, FAT long names via FUSE). */
  const val MAX_NAME_BYTES = 255

  /** Shown for an incoming document whose provider gives no usable name. */
  const val INCOMING_FALLBACK_NAME = "document.pdf"

  /**
   * A display name from another app's provider, made safe to show and to reuse as a file name:
   * no '/', '\\', control or bidi-override characters, no leading dots or surrounding
   * whitespace, at most [MAX_NAME_BYTES] bytes of UTF-8 (cut before the extension, never inside
   * a character). [INCOMING_FALLBACK_NAME] when nothing is left.
   */
  fun incomingDisplayName(raw: String): String {
    val cleaned = raw.filterNot { it == '/' || it == '\\' || Character.isISOControl(it) || it in BIDI_CONTROLS }
      .trim()
      .trimStart('.')
      .trim()
    return capBytes(cleaned).ifEmpty { INCOMING_FALLBACK_NAME }
  }

  private val BIDI_CONTROLS: Set<Char> =
    (('\u202A'..'\u202E') + ('\u2066'..'\u2069') + listOf('\u200E', '\u200F')).toSet()

  private fun utf8Size(s: String) = s.toByteArray(Charsets.UTF_8).size

  private fun capBytes(name: String): String {
    if (utf8Size(name) <= MAX_NAME_BYTES) return name
    val (base, ext) = split(name)
    val keepExt = if (utf8Size(ext) < MAX_NAME_BYTES / 2) ext else ""
    val budget = MAX_NAME_BYTES - utf8Size(keepExt)
    val source = if (keepExt.isEmpty()) name else base
    val out = StringBuilder()
    var used = 0
    var i = 0
    while (i < source.length) {
      val cp = source.codePointAt(i)
      val chars = Character.charCount(cp)
      val size = utf8Size(source.substring(i, i + chars))
      if (used + size > budget) break
      out.append(source, i, i + chars)
      used += size
      i += chars
    }
    return out.toString().trimEnd() + keepExt
  }

  private fun split(name: String): Pair<String, String> {
    val dot = name.lastIndexOf('.')
    return if (dot > 0) name.substring(0, dot) to name.substring(dot) else name to ""
  }
}
