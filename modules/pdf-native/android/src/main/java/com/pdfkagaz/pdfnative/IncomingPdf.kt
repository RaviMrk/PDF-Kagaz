package com.pdfkagaz.pdfnative

/** Recognises PDFs shared to this app (ACTION_SEND); ACTION_VIEW is left to Linking. */
object IncomingPdf {
  const val PDF_MIME = "application/pdf"
  private const val ACTION_SEND = "android.intent.action.SEND"

  /** The shared stream URI, or null when the intent is not a PDF shared with ACTION_SEND. */
  fun streamUriOf(action: String?, type: String?, stream: String?): String? =
    if (action == ACTION_SEND && type == PDF_MIME && !stream.isNullOrBlank()) stream else null
}
