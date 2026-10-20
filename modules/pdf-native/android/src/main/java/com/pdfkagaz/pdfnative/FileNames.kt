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

  private fun split(name: String): Pair<String, String> {
    val dot = name.lastIndexOf('.')
    return if (dot > 0) name.substring(0, dot) to name.substring(dot) else name to ""
  }
}
