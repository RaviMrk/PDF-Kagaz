package com.pdfkagaz.pdfnative

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.ext.SdkExtensions
import android.provider.MediaStore
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

/** Launch input for [PickImagesContract]: the most images one pick may return. */
internal data class PickImagesInput(val max: Int) : Serializable

/**
 * The system photo picker, images only: ACTION_PICK_IMAGES where available (API 33+, or API 30+
 * with SDK extension 2), else androidx's fallback (ACTION_OPEN_DOCUMENT for images). Needs no media
 * permission; no persistable grant is taken. Returns the picked URIs ([PickerResults]), empty when
 * cancelled.
 */
internal class PickImagesContract : AppContextActivityResultContract<PickImagesInput, List<String>> {
  override fun createIntent(context: Context, input: PickImagesInput): Intent {
    val request = PickVisualMediaRequest(PickVisualMedia.ImageOnly)
    if (input.max <= 1) return PickVisualMedia().createIntent(context, request)
    return PickMultipleVisualMedia(maxItems(input.max)).createIntent(context, request)
  }

  override fun parseResult(input: PickImagesInput, resultCode: Int, intent: Intent?): List<String> {
    if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()
    val clip = intent.clipData
    val items = if (clip == null) emptyList() else (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri?.toString() }
    return PickerResults.urisOf(intent.dataString, items, input.max)
  }

  /** PickMultipleVisualMedia needs at least 2 and, on the system picker, at most its own limit. */
  private fun maxItems(max: Int): Int {
    val limit = if (isSystemPickerAvailable()) MediaStore.getPickImagesMaxLimit() else max
    return max.coerceIn(2, limit.coerceAtLeast(2))
  }

  @SuppressLint("NewApi")
  private fun isSystemPickerAvailable(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2)
}
