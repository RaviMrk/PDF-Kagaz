package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.Context
import android.content.IntentSender
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * The Google Play services document scanner (ML Kit, full mode, JPEG pages, no gallery import).
 * Its UI, camera and models belong to Play services; this app holds no camera permission.
 */
class DocumentScanner(private val context: Context) {
  /** The scanner's IntentSender, or ERR_SCANNER_UNAVAILABLE. Call on the main thread. */
  suspend fun startIntent(activity: Activity, pageLimit: Int): IntentSender =
    try {
      val status = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
      if (status != ConnectionResult.SUCCESS) {
        Log.w(TAG, "Scanner unavailable: Play services status $status")
        throw ScannerUnavailableException()
      }
      val options = GmsDocumentScannerOptions.Builder()
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setGalleryImportAllowed(false)
        .setPageLimit(pageLimit)
        .build()
      GmsDocumentScanning.getClient(options).getStartScanIntent(activity).await()
    } catch (e: CancellationException) {
      throw e
    } catch (e: ScannerUnavailableException) {
      throw e
    } catch (e: Exception) {
      // Class and status code only: messages are not ours to vouch for.
      val code = (e as? MlKitException)?.errorCode ?: (e as? ApiException)?.statusCode
      Log.w(TAG, "Scanner unavailable: ${e.javaClass.name} code=$code")
      throw ScannerUnavailableException(cause = e)
    }

  /** Awaits a Play services [Task] without a coroutines-play-services dependency. */
  private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { task ->
      when {
        task.isSuccessful -> continuation.resume(task.result)
        task.isCanceled -> continuation.resumeWithException(ScannerUnavailableException())
        else -> continuation.resumeWithException(task.exception ?: ScannerUnavailableException())
      }
    }
  }

  private companion object {
    const val TAG = "PdfNative"
  }
}
