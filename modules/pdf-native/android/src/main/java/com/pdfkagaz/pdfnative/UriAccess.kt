package com.pdfkagaz.pdfnative

/**
 * Which URIs the app may read on behalf of another app or hand to one (share, open-with, print,
 * incoming intents). Refuses confused-deputy reads: content:// URIs served by this app's own
 * providers (we can read them; the caller could not), and app-private files ([ShareablePaths]).
 */
object UriAccess {
  /**
   * [canonicalPath] is the canonical file path for file:// URIs; [authorityPackage] the package
   * owning the content:// authority, or null when no provider resolves (the stat then fails).
   */
  fun isAllowed(
    scheme: String?,
    canonicalPath: String?,
    authorityPackage: String?,
    ownPackage: String,
    dataDir: String,
    readerDir: String,
  ): Boolean = when (scheme) {
    "file" -> canonicalPath != null && ShareablePaths.isShareable(canonicalPath, dataDir, readerDir)
    "content" -> authorityPackage != ownPackage
    else -> false
  }
}
