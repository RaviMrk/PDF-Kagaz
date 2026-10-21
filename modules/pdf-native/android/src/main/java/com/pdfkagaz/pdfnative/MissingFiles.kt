package com.pdfkagaz.pdfnative

/**
 * Whether a "not found" may only mean "not visible to us". Without storage access (All files
 * access revoked, or READ_EXTERNAL_STORAGE on API < 30) a file on a mounted volume, or a MediaStore
 * item, can look missing while it still exists: such a result must not delete its index row.
 */
object MissingFiles {
  /** [path] is the URI path (absolute for file://); [volumeRoots] the mounted volume roots. */
  fun mayBeHidden(
    scheme: String?,
    path: String?,
    authority: String?,
    volumeRoots: List<String>,
    hasStorageAccess: Boolean,
  ): Boolean {
    if (hasStorageAccess) return false
    return when (scheme) {
      "file" -> path != null && volumeRoots.any { ShareablePaths.isInside(path, it) }
      "content" -> authority == MEDIA_AUTHORITY
      else -> false
    }
  }

  private const val MEDIA_AUTHORITY = "media"
}
