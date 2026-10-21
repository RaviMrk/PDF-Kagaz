package com.pdfkagaz.pdfnative

/**
 * Which URIs the app may read on behalf of another app or hand to one (share, open-with, print,
 * incoming intents). Refuses confused-deputy reads: content:// URIs served by this app's own
 * providers (we can read them; the caller could not) and file:// paths outside [ShareablePaths].
 */
object UriAccess {
  /**
   * [canonicalPath]: the canonical file path of a file:// URI. For content:// URIs [authority] is
   * the raw (still percent-encoded) authority; [authorityPackage] the package owning it, or null
   * when no provider resolves (API 30+ package visibility can hide a sender's provider: then the
   * stat decides). Our own providers are refused by declared authority ([ownAuthorities]) and by
   * owner. Authorities with userinfo, a port or escapes ("0@<a>", "<a>:1", "0%40<a>") are refused:
   * ContentResolver strips the user prefix and would reach the provider behind any lookup.
   */
  fun isAllowed(
    scheme: String?,
    canonicalPath: String?,
    authority: String?,
    authorityPackage: String?,
    ownPackage: String,
    ownAuthorities: Set<String>,
    rules: PathRules,
  ): Boolean = when (scheme) {
    "file" -> canonicalPath != null && ShareablePaths.isShareable(canonicalPath, rules)
    "content" ->
      !authority.isNullOrBlank() &&
        authority.none { it == '@' || it == ':' || it == '%' || it.isWhitespace() } &&
        ownAuthorities.none { it.equals(authority, ignoreCase = true) } &&
        authorityPackage != ownPackage
    else -> false
  }

  /** Authorities declared by providers (each may list several, separated by ';'). */
  fun authoritiesOf(declared: List<String?>): Set<String> =
    declared.filterNotNull().flatMap { it.split(';') }.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
}
