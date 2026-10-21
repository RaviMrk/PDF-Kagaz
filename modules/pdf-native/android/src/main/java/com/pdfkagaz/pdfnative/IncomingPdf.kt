package com.pdfkagaz.pdfnative

/** Recognises PDFs handed to this app: shared (ACTION_SEND) or opened with it (ACTION_VIEW). */
object IncomingPdf {
  const val PDF_MIME = "application/pdf"
  private const val ACTION_SEND = "android.intent.action.SEND"
  private const val ACTION_VIEW = "android.intent.action.VIEW"
  private val INCOMING_SCHEMES = setOf("content", "file")

  /** The shared stream URI, or null when the intent is not a PDF shared with ACTION_SEND. */
  fun streamUriOf(action: String?, type: String?, stream: String?): String? =
    if (action == ACTION_SEND && type == PDF_MIME && !stream.isNullOrBlank()) stream else null

  /**
   * The PDF an activity was launched with: a shared stream, or the content:// / file:// data of
   * ACTION_VIEW (the manifest only routes PDF VIEWs with those schemes here). App links are null.
   */
  fun launchUriOf(action: String?, type: String?, stream: String?, data: String?): String? {
    streamUriOf(action, type, stream)?.let { return it }
    if (action != ACTION_VIEW || data.isNullOrBlank()) return null
    val scheme = data.substringBefore("://", missingDelimiterValue = "").lowercase()
    return if (scheme in INCOMING_SCHEMES) data else null
  }
}
