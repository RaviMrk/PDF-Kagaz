package com.pdfkagaz.pdfnative

import android.content.Context

/**
 * The folder (tree) grants pickFolder took, recorded so grant trimming never releases them
 * ([IncomingGrants]). Seeded once from the existing persisted grants (see folderRootsOrSeed).
 */
class FolderGrants(private val context: Context) {
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun roots(): Set<String> {
    val stored = if (prefs.contains(KEY)) prefs.getStringSet(KEY, emptySet())?.toSet() ?: emptySet() else null
    val persisted = context.contentResolver.persistedUriPermissions.map { it.uri.toString() }
    val roots = IncomingGrants.folderRootsOrSeed(stored, persisted)
    if (stored == null) save(roots)
    return roots
  }

  @Synchronized
  fun add(uri: String) = save(roots() + uri)

  @Synchronized
  fun remove(uri: String) = save(roots() - uri)

  private fun save(roots: Set<String>) {
    prefs.edit().putStringSet(KEY, HashSet(roots)).apply()
  }

  private companion object {
    const val PREFS = "pdfnative.folder_grants"
    const val KEY = "roots"
  }
}
