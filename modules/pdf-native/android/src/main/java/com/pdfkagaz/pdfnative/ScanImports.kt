package com.pdfkagaz.pdfnative

/**
 * Process-wide "scan import in flight" state. While a scan's pages are being imported (and their
 * scanner files deleted), cacheDir/mlkit_docscan_ui_client/ must not be swept; at any other time
 * every file there is a leftover of a scan whose result reached no waiting call, and is swept.
 */
object ScanImports {
  private val lock = Any()
  private var inFlight = 0

  fun isIdle(): Boolean = synchronized(lock) { inFlight == 0 }

  /** Runs [block] (a scan import) with the import marked in flight, until it returns or throws. */
  inline fun <T> tracking(block: () -> T): T {
    begin()
    try {
      return block()
    } finally {
      end()
    }
  }

  /** Runs [sweep] only when no import is in flight; an import cannot start while it runs. */
  fun sweepIfIdle(sweep: () -> Int): Int = synchronized(lock) { if (inFlight == 0) sweep() else 0 }

  @PublishedApi internal fun begin() {
    synchronized(lock) { inFlight++ }
  }

  @PublishedApi internal fun end() {
    synchronized(lock) { inFlight-- }
  }
}
