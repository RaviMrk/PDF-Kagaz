package com.pdfkagaz.pdfnative

/**
 * Which URIs the app may read on behalf of another app or hand to one (share, open-with, print,
 * incoming intents). Refuses confused-deputy reads: content:// URIs served by this app's own
 * providers (we can read them; the caller could not), and app-private files ([ShareablePaths]).
 */
object UriAccess {
  /**
   * [canonicalPath] is the canonical file path for file:// URIs. For content:// URIs [authority] is
   * the raw (still percent-encoded) authority and [authorityPackage] the package owning it (null when no provider resolves).
   * Authorities with userinfo or a port ("0@<authority>", "<authority>:1") are refused: PackageManager
   * does not resolve them, but ContentResolver strips the user prefix and reaches the provider anyway;
   * '%' is refused too, so an encoded "%40" cannot hide one.
   */
  fun isAllowed(
    scheme: String?,
    canonicalPath: String?,
    authority: String?,
    authorityPackage: String?,
    ownPackage: String,
    privateDirs: List<String>,
    readerDir: String,
  ): Boolean = when (scheme) {
    "file" -> canonicalPath != null && ShareablePaths.isShareable(canonicalPath, privateDirs, readerDir)
    "content" ->
      !authority.isNullOrBlank() &&
        authority.none { it == '@' || it == ':' || it == '%' } &&
        authorityPackage != null &&
        authorityPackage != ownPackage
    else -> false
  }
}
