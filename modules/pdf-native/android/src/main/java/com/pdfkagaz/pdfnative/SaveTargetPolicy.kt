package com.pdfkagaz.pdfnative

/**
 * A document as seen by [SaveTargetPolicy]: its URI string, and when known its provider authority
 * and document id (content://) or canonical path (file://).
 */
data class DocRef(val uri: String, val authority: String?, val documentId: String?, val canonicalPath: String?)

/**
 * Pure rules for writing a "Save as" copy into the document the user chose. ACTION_CREATE_DOCUMENT
 * lets the user confirm overwriting an existing document (even the source itself), so only a target
 * known to be empty and distinct from the source may be written — or deleted after a failure.
 */
object SaveTargetPolicy {
  enum class Decision { WRITE, REFUSE }

  /** [targetSize] null when the provider does not report it: not verifiably empty, so refused. */
  fun decide(targetSize: Long?, sameAsSource: Boolean): Decision =
    if (!sameAsSource && targetSize == 0L) Decision.WRITE else Decision.REFUSE

  /** Same URI, same document id on the same provider, or same canonical file path. */
  fun sameDocument(a: DocRef, b: DocRef): Boolean {
    if (a.uri == b.uri) return true
    if (a.documentId != null && a.documentId == b.documentId &&
      a.authority != null && a.authority.equals(b.authority, ignoreCase = true)
    ) {
      return true
    }
    return a.canonicalPath != null && a.canonicalPath == b.canonicalPath
  }
}
