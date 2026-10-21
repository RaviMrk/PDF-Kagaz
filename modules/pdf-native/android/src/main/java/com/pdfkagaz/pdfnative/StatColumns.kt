package com.pdfkagaz.pdfnative

import android.provider.DocumentsContract.Document
import android.provider.MediaStore
import android.provider.OpenableColumns

/**
 * Which columns [PdfFileInfos.stat] asks a content provider for, and how it reads them.
 * Only DISPLAY_NAME and SIZE (OpenableColumns) are promised by every provider; FileProvider
 * shares (WhatsApp, Gmail…) return nothing else, so other columns are read by name and may be absent.
 */
object StatColumns {
  enum class Kind { DOCUMENT, MEDIA_STORE, OPENABLE }

  fun kindOf(isDocument: Boolean, authority: String?): Kind = when {
    isDocument -> Kind.DOCUMENT
    authority == MediaStore.AUTHORITY -> Kind.MEDIA_STORE
    else -> Kind.OPENABLE
  }

  fun projection(kind: Kind): Array<String> = when (kind) {
    Kind.DOCUMENT -> arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED)
    Kind.MEDIA_STORE -> arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED)
    Kind.OPENABLE -> arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
  }

  /** Name of the modification column for [kind], or null when providers of that kind have none. */
  fun modifiedColumn(kind: Kind): String? = when (kind) {
    Kind.DOCUMENT -> Document.COLUMN_LAST_MODIFIED
    Kind.MEDIA_STORE -> MediaStore.MediaColumns.DATE_MODIFIED
    Kind.OPENABLE -> null
  }

  /**
   * Missing or NULL columns fall back to "" / 0. A modification time of 0 means "unknown"
   * (callers treat it like any other content version). MediaStore DATE_MODIFIED is in seconds.
   */
  fun toStat(kind: Kind, name: String?, size: Long?, modified: Long?): UriStat {
    val raw = modified ?: 0L
    return UriStat(
      name = name ?: "",
      sizeBytes = size ?: 0L,
      modifiedAt = if (kind == Kind.MEDIA_STORE) raw * 1000L else raw,
    )
  }
}
