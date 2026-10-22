package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Serializable

/** Launch input for [CreateDocumentContract]: the name the picker suggests. */
internal data class CreateDocumentInput(val suggestedName: String) : Serializable

/** ACTION_CREATE_DOCUMENT for one PDF; the created document's URI, or null when cancelled. */
internal class CreateDocumentContract : AppContextActivityResultContract<CreateDocumentInput, Uri?> {
  override fun createIntent(context: Context, input: CreateDocumentInput): Intent =
    Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType(IncomingPdf.PDF_MIME)
      .putExtra(Intent.EXTRA_TITLE, input.suggestedName)

  override fun parseResult(input: CreateDocumentInput, resultCode: Int, intent: Intent?): Uri? =
    if (resultCode == Activity.RESULT_OK) intent?.data else null
}
