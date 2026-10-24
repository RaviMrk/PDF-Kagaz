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

/**
 * Share / open-with chooser intents for a PDF or saved page images; file:// sources go through
 * [PdfNativeFileProvider].
 */
class PdfIntents(private val context: Context) {
  /**
   * Stats [uri] on IO (missing → ERR_FILE_NOT_FOUND / ERR_VOLUME_UNAVAILABLE, no grant →
   * ERR_PERMISSION_DENIED) and returns the URI other apps can read: content:// (other apps'
   * providers only, MediaStore included) as is; reader cache copies through the provider; any other
   * file:// PDF or image as a share-cache copy through the provider. Our own providers and app-private files are refused ([UriGuard]).
   */
  suspend fun shareUriOf(uri: String): Uri = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val guard = UriGuard(context)
      val parsed = guard.requireAllowed(Uri.parse(uri))
      val stat = RenderSupport.statOrThrow(context, parsed)
      if (parsed.scheme != "file") return@withContext parsed
      val source = File(parsed.path ?: throw FileNotFoundCodedException())
      val file = if (ShareablePaths.isInside(source.path, guard.readerDir)) {
        // The reader copy is in use by another app now: Clear cache keeps it for 10 minutes.
        CacheCleaner.touch(source, System.currentTimeMillis())
        source
      } else {
        ShareFiles(context).copyOf(source, stat)
      }
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

  /** One image: ACTION_SEND; several: ACTION_SEND_MULTIPLE; any image type ([IMAGE_MIME]), a read grant on each. */
  fun sendImagesChooser(shareUris: List<Uri>, chooserTitle: String): Intent {
    if (shareUris.isEmpty()) throw FileNotFoundCodedException()
    val clip = ClipData.newRawUri("", shareUris[0]).apply {
      for (uri in shareUris.drop(1)) addItem(ClipData.Item(uri))
    }
    val target = if (shareUris.size == 1) {
      Intent(Intent.ACTION_SEND).apply { putExtra(Intent.EXTRA_STREAM, shareUris[0]) }
    } else {
      Intent(Intent.ACTION_SEND_MULTIPLE).apply { putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(shareUris)) }
    }
    target.type = IMAGE_MIME
    target.clipData = clip
    target.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return chooser(target, chooserTitle)
  }

  /** ACTION_VIEW of one image (its own type when the provider reports one, else [IMAGE_MIME]). */
  fun viewImageChooser(shareUri: Uri, chooserTitle: String): Intent {
    val type = try {
      context.contentResolver.getType(shareUri)?.takeIf { it.startsWith("image/") }
    } catch (_: Exception) {
      null
    }
    return chooser(
      Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(shareUri, type ?: IMAGE_MIME)
        clipData = ClipData.newRawUri("", shareUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      },
      chooserTitle,
    )
  }

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
    const val IMAGE_MIME = "image/*"
  }
}
