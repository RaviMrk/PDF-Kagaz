package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

/** Launch input for [OpenDocumentsContract]. */
internal data class OpenDocumentsInput(val multiple: Boolean) : Serializable

/**
 * ACTION_OPEN_DOCUMENT for PDFs; the picked URIs ([PickerResults]), empty when cancelled. No
 * persistable grant is requested or taken: picked inputs are staged while the app runs, and
 * persisted grants are bounded for folders' sake ([IncomingGrants]).
 */
internal class OpenDocumentsContract : AppContextActivityResultContract<OpenDocumentsInput, List<String>> {
  override fun createIntent(context: Context, input: OpenDocumentsInput): Intent =
    Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType(IncomingPdf.PDF_MIME)
      .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, input.multiple)

  override fun parseResult(input: OpenDocumentsInput, resultCode: Int, intent: Intent?): List<String> {
    if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()
    val clip = intent.clipData
    val items = if (clip == null) emptyList() else (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri?.toString() }
    return PickerResults.urisOf(intent.dataString, items)
  }
}
