package com.pdfkagaz.pdfnative

/**
 * Which file:// paths may be handed to other apps through [PdfNativeFileProvider]. The provider's
 * root-path covers the whole filesystem (shared storage, SD cards, reader cache copies), so this
 * keeps the app's own private data out: inside [dataDir] only files under [readerDir] qualify.
 * Paths are expected canonical.
 */
object ShareablePaths {
  fun isShareable(path: String, dataDir: String, readerDir: String): Boolean =
    !isUnder(path, dataDir) || isStrictlyUnder(path, readerDir)

  private fun isUnder(path: String, dir: String) = path == dir || isStrictlyUnder(path, dir)

  private fun isStrictlyUnder(path: String, dir: String) = path.startsWith(dir.trimEnd('/') + "/")
}
