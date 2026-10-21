package com.pdfkagaz.pdfnative

/** A persisted read grant: its URI string and ContentResolver persistedTime. */
data class PersistedGrant(val uri: String, val persistedTime: Long)

/**
 * Bounds the persisted grants taken for incoming documents. On API 24–29 the system keeps at most
 * 128 per app and prunes the oldest, which could silently drop the user's SAF folder (tree)
 * grants; tree grants are never released here.
 */
object IncomingGrants {
  const val MAX_DOCUMENT_GRANTS = 32

  /** content://<authority>/tree/… (a folder grant from the folder picker). */
  fun isTree(uri: String): Boolean {
    if (!uri.startsWith("content://")) return false
    val segments = uri.removePrefix("content://").split('/')
    return segments.size >= 3 && segments[1] == "tree"
  }

  /** Document (non-tree) grants beyond the newest [keep], oldest first. */
  fun toRelease(grants: List<PersistedGrant>, keep: Int): List<String> =
    grants
      .filter { !isTree(it.uri) }
      .sortedByDescending { it.persistedTime }
      .drop(keep)
      .sortedBy { it.persistedTime }
      .map { it.uri }
}
