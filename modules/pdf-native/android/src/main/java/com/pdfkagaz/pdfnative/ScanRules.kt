package com.pdfkagaz.pdfnative

/** Pure scan rules (F-02). No android.* imports so they run under JVM unit tests. */
object ScanRules {
  /** Folders checked on every quick scan, relative to the primary volume root. */
  val HOT_FOLDERS: List<String> = listOf(
    "Download",
    "Documents",
    "Documents/PDFToolkit",
    "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
    "WhatsApp/Media/WhatsApp Documents",
  )

  private val SKIPPED_REL_PATHS = setOf("android/data", "android/obb")

  /** [relPath] is the folder path relative to the volume (or tree) root, '/'-separated. */
  fun shouldSkipDir(name: String, relPath: String): Boolean =
    name.startsWith(".") ||
      name == "lost+found" ||
      relPath.trim('/').lowercase() in SKIPPED_REL_PATHS

  fun isPdf(name: String): Boolean =
    !name.startsWith(".") && name.endsWith(".pdf", ignoreCase = true)

  /** Folder shown in the UI: [relDir] under the volume, prefixed with the volume label for removable volumes. */
  fun displayFolder(relDir: String, volumePrefix: String?): String = when {
    volumePrefix == null -> relDir
    relDir.isEmpty() -> volumePrefix
    else -> "$volumePrefix/$relDir"
  }

  /** `/storage/X/Android/data/<pkg>/files` → `/storage/X`; null (unmounted volume) or unknown layout → null. */
  fun volumeRootFromAppDir(appDirPath: String?): String? {
    if (appDirPath == null) return null
    val idx = appDirPath.indexOf("/Android/data/")
    return if (idx > 0) appDirPath.substring(0, idx) else null
  }
}
