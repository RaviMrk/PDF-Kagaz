package com.pdfkagaz.pdfnative

/**
 * Canonical directories that decide which file:// paths may be read on behalf of other apps.
 * [volumeRoots]: currently mounted storage volumes; [appDirs]: this app's Android/data and
 * Android/obb dirs on them; [cacheDirs]: cacheDir/reader and cacheDir/share.
 */
data class PathRules(val volumeRoots: List<String>, val appDirs: List<String>, val cacheDirs: List<String>)

/**
 * Allowlist for file:// paths handed to other apps (shared, opened with, printed) or indexed from
 * incoming intents: strictly inside a mounted volume (outside this app's dirs there) or inside a
 * cache copy dir. App dirs are matched case-insensitively. Everything else (/proc, /data, /system, unmounted volumes…) is refused.
 * Paths must be canonical, or the kernel's view of an opened descriptor (/proc/self/fd readlink).
 */
object ShareablePaths {
  fun isShareable(path: String, rules: PathRules): Boolean {
    if (rules.cacheDirs.any { isInside(path, it) }) return true
    if (rules.volumeRoots.none { isInside(path, it) }) return false
    // Android/data and Android/obb are case-insensitive on emulated and FAT/exFAT volumes.
    val lower = path.lowercase()
    return rules.appDirs.none {
      val dir = it.trimEnd('/').lowercase()
      lower == dir || lower.startsWith("$dir/")
    }
  }

  /** [path] is strictly below [dir]. */
  fun isInside(path: String, dir: String): Boolean = path.startsWith(dir.trimEnd('/') + "/")
}
