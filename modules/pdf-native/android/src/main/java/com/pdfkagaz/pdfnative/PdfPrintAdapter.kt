package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import java.io.FileOutputStream
import kotlin.concurrent.thread

/** Hands a PDF to the Android print service as is (the spooler renders it); the source is only read. */
class PdfPrintAdapter(
  private val context: Context,
  private val uri: Uri,
  private val jobName: String,
) : PrintDocumentAdapter() {
  override fun onLayout(
    oldAttributes: PrintAttributes?,
    newAttributes: PrintAttributes?,
    cancellationSignal: CancellationSignal?,
    callback: LayoutResultCallback,
    extras: Bundle?,
  ) {
    if (cancellationSignal?.isCanceled == true) {
      callback.onLayoutCancelled()
      return
    }
    val info = PrintDocumentInfo.Builder(jobName)
      .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
      .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
      .build()
    callback.onLayoutFinished(info, oldAttributes != newAttributes)
  }

  override fun onWrite(
    pages: Array<out PageRange>?,
    destination: ParcelFileDescriptor,
    cancellationSignal: CancellationSignal?,
    callback: WriteResultCallback,
  ) {
    thread(name = "PdfPrintAdapter") {
      try {
        // file:// is re-checked on the opened descriptor; content:// goes through the resolver.
        val input = UriGuard(context).openInput(uri)
        input.use {
          FileOutputStream(destination.fileDescriptor).use { output ->
            val buffer = ByteArray(BUFFER_BYTES)
            while (true) {
              if (cancellationSignal?.isCanceled == true) {
                callback.onWriteCancelled()
                return@thread
              }
              val read = input.read(buffer)
              if (read < 0) break
              output.write(buffer, 0, read)
            }
          }
        }
        callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
      } catch (e: Exception) {
        // IOException, SecurityException…: their messages may contain the path.
        callback.onWriteFailed(WRITE_FAILED)
      }
    }
  }

  private companion object {
    const val BUFFER_BYTES = 256 * 1024
    const val WRITE_FAILED = "Could not read the PDF"
  }
}
