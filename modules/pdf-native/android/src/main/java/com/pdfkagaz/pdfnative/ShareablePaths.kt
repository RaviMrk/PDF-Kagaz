package com.pdfkagaz.pdfnative

/**
 * Which file:// paths may be handed to other apps (copied into the share cache or printed).
 * Inside the app's private dirs (data, device-protected data, Android/data and Android/obb on every
 * volume) only reader cache copies under [readerDir] qualify. Paths are expected canonical.
 */
object ShareablePaths {
  fun isShareable(path: String, privateDirs: List<String>, readerDir: String): Boolean =
    privateDirs.none { path == it.trimEnd('/') || isInside(path, it) } || isInside(path, readerDir)

  /** [path] is strictly below [dir]. */
  fun isInside(path: String, dir: String): Boolean = path.startsWith(dir.trimEnd('/') + "/")
}
