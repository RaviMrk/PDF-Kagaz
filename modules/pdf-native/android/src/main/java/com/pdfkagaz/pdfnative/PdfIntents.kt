package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Parcelable
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Share / open-with chooser intents for a PDF; file:// sources go through [PdfNativeFileProvider]. */
class PdfIntents(private val context: Context) {
  /**
   * Stats [uri] on IO (missing → ERR_FILE_NOT_FOUND / ERR_VOLUME_UNAVAILABLE, no grant →
   * ERR_PERMISSION_DENIED) and returns the URI other apps can read: content:// as is, file://
   * through the provider. Our own providers and app-private files are refused ([UriGuard]).
   */
  suspend fun shareUriOf(uri: String): Uri = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val parsed = UriGuard(context).requireAllowed(Uri.parse(uri))
      RenderSupport.statOrThrow(context, parsed)
      if (parsed.scheme != "file") return@withContext parsed
      val file = File(parsed.path ?: throw FileNotFoundCodedException())
      try {
        FileProvider.getUriForFile(context, "${context.packageName}$AUTHORITY_SUFFIX", file)
      } catch (e: IllegalArgumentException) {
        // Path not covered by pdf_native_file_paths; the message contains the path.
        throw PermissionDeniedException(cause = e)
      }
    }
  }

  fun sendChooser(shareUri: Uri, chooserTitle: String): Intent =
    chooser(
      Intent(Intent.ACTION_SEND).apply {
        type = IncomingPdf.PDF_MIME
        putExtra(Intent.EXTRA_STREAM, shareUri)
        clipData = ClipData.newRawUri("", shareUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      },
      chooserTitle,
    )

  fun viewChooser(shareUri: Uri, chooserTitle: String): Intent =
    chooser(
      Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(shareUri, IncomingPdf.PDF_MIME)
        clipData = ClipData.newRawUri("", shareUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      },
      chooserTitle,
    )

  /** Starts [intent] from the current activity; call on the main thread. */
  fun start(activity: Activity?, intent: Intent) {
    try {
      (activity ?: throw NoActivityException()).startActivity(intent)
    } catch (e: ActivityNotFoundException) {
      throw NoActivityException(cause = e)
    } catch (e: SecurityException) {
      // Its message may contain the URI.
      throw PermissionDeniedException(cause = e)
    }
  }

  /** The chooser hides this app itself (sharing a PDF back to us makes no sense). */
  private fun chooser(target: Intent, title: String): Intent {
    val chooser = Intent.createChooser(target, title)
    val self: ComponentName? = context.packageManager.getLaunchIntentForPackage(context.packageName)?.component
    if (self != null) chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf<Parcelable>(self))
    return chooser
  }

  companion object {
    const val AUTHORITY_SUFFIX = ".pdfnative.files"
  }
}
