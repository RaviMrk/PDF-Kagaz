package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

/** Launch input for [ScanDocumentContract]; the token only makes each launch distinct. */
internal data class ScanLaunchInput(val token: Long) : Serializable

/** What one scanner launch returned. */
sealed class ScanOutcome : Serializable {
  /** The page JPEG uris, in scanner order. */
  data class Pages(val uris: List<String>) : ScanOutcome()

  data object Cancelled : ScanOutcome()

  /** The scanner's IntentSender could not be started. */
  data object Failed : ScanOutcome()
}

/**
 * Starts the ML Kit scanner's [IntentSender] through Expo's activity-result registry (its
 * ACTION_INTENT_SENDER_REQUEST path), so a result survives activity recreation like the pickers'.
 * [pendingSender] must be set right before each launch.
 */
internal class ScanDocumentContract : AppContextActivityResultContract<ScanLaunchInput, ScanOutcome> {
  @Volatile var pendingSender: IntentSender? = null

  override fun createIntent(context: Context, input: ScanLaunchInput): Intent {
    val sender = checkNotNull(pendingSender) { "No scanner intent to launch" }
    pendingSender = null
    return Intent(StartIntentSenderForResult.ACTION_INTENT_SENDER_REQUEST)
      .putExtra(StartIntentSenderForResult.EXTRA_INTENT_SENDER_REQUEST, IntentSenderRequest.Builder(sender).build())
  }

  override fun parseResult(input: ScanLaunchInput, resultCode: Int, intent: Intent?): ScanOutcome {
    if (intent?.hasExtra(StartIntentSenderForResult.EXTRA_SEND_INTENT_EXCEPTION) == true) return ScanOutcome.Failed
    if (resultCode != Activity.RESULT_OK || intent == null) return ScanOutcome.Cancelled
    val pages = GmsDocumentScanningResult.fromActivityResultIntent(intent)?.pages ?: return ScanOutcome.Cancelled
    return ScanOutcome.Pages(pages.map { it.imageUri.toString() })
  }
}
