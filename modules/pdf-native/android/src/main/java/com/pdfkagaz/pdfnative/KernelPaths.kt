package com.pdfkagaz.pdfnative

/**
 * The kernel's path of an opened descriptor (/proc/self/fd readlink) need not use the /storage
 * names: on API 24–29 (sdcardfs) and with FUSE passthrough it may be a /mnt/runtime, /mnt/user,
 * /mnt/media_rw or /data/media view of the same volume. Each known alias is mapped back to its
 * /storage path, then checked against the same [ShareablePaths] rules, so a volume's
 * Android/data and Android/obb dirs stay refused under every name.
 */
object KernelPaths {
  /**
   * [realRoots]: (Os.realpath of a mounted volume root, its canonical root) for roots whose
   * kernel path differs from the canonical one.
   */
  fun isShareable(path: String, rules: PathRules, realRoots: List<Pair<String, String>>): Boolean =
    candidates(path, realRoots).any { ShareablePaths.isShareable(it, rules) }

  /** [path] itself plus its /storage equivalents; empty for paths with '.', '..' or empty segments. */
  fun candidates(path: String, realRoots: List<Pair<String, String>>): List<String> {
    if (!path.startsWith("/")) return emptyList()
    if (path.split('/').drop(1).any { it.isEmpty() || it == "." || it == ".." }) return emptyList()
    val out = linkedSetOf(path)
    for ((real, canonical) in realRoots) {
      val realRoot = real.trimEnd('/')
      if (realRoot.isNotEmpty() && ShareablePaths.isInside(path, realRoot)) {
        out += canonical.trimEnd('/') + path.substring(realRoot.length)
      }
    }
    for ((pattern, replacement) in ALIASES) {
      pattern.matchEntire(path)?.let { out += it.groupValues.let { g -> replacement(g[1], g[2]) } }
    }
    return out.toList()
  }

  /** (volume, rest-of-path) → /storage path. Volume is "emulated/<user>" or a volume id. */
  private val ALIASES: List<Pair<Regex, (String, String) -> String>> = listOf(
    Regex("^/mnt/runtime/(?:default|read|write|full)/(emulated/\\d+|[^/]+)(/.+)$") to { v, rest -> "/storage/$v$rest" },
    Regex("^/mnt/user/\\d+/(emulated/\\d+|[^/]+)(/.+)$") to { v, rest -> "/storage/$v$rest" },
    Regex("^/mnt/media_rw/([^/]+)(/.+)$") to { v, rest -> "/storage/$v$rest" },
    Regex("^/data/media/(\\d+)(/.+)$") to { user, rest -> "/storage/emulated/$user$rest" },
  )
}
