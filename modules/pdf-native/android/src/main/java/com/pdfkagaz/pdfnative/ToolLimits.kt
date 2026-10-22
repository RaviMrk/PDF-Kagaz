package com.pdfkagaz.pdfnative

/** Pure size-cap rules for staging tool inputs; the cap is enforced on bytes actually copied. */
object ToolLimits {
  /** A reported size over the cap is refused before opening; 0 (unknown) never is. */
  fun exceedsKnownSize(sizeBytes: Long, maxBytes: Long): Boolean = sizeBytes > maxBytes

  /** Checked while streaming, so an unknown or wrong reported size cannot bypass the cap. */
  fun exceedsCopied(copiedBytes: Long, maxBytes: Long): Boolean = copiedBytes > maxBytes
}
