package com.pdfkagaz.pdfnative

/** A persisted read grant: its URI string and ContentResolver persistedTime. */
data class PersistedGrant(val uri: String, val persistedTime: Long)

/**
 * Bounds the persisted grants taken for incoming documents. On API 24–29 the system keeps at most
 * 128 per app and prunes the oldest, which could silently drop the user's folder grants. Folder
 * grants are the ones pickFolder recorded ([FolderGrants]); every other grant is an incoming one.
 */
object IncomingGrants {
  const val MAX_DOCUMENT_GRANTS = 32

  /** Incoming (non-folder) grants beyond the newest [keep], oldest first. */
  fun toRelease(grants: List<PersistedGrant>, folderRoots: Set<String>, keep: Int): List<String> =
    grants
      .filter { it.uri !in folderRoots }
      .sortedByDescending { it.persistedTime }
      .drop(keep)
      .sortedBy { it.persistedTime }
      .map { it.uri }

  /**
   * The recorded folder roots, or — the first time, before any were recorded — every persisted
   * grant: until incoming grants existed, pickFolder was the only code taking persisted grants.
   */
  fun folderRootsOrSeed(stored: Set<String>?, persisted: List<String>): Set<String> = stored ?: persisted.toSet()
}
