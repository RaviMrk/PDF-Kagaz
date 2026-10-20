package com.pdfkagaz.pdfnative

import android.app.Activity
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.providers.AppContextProvider
import java.io.Serializable

/** Launch input for [FolderPickerContract]; carries nothing but must be Serializable. */
internal class FolderPickerInput : Serializable

/**
 * ACTION_OPEN_DOCUMENT_TREE; on success takes a persistable read/write grant and returns the tree
 * URI, on cancel null. Modeled on expo-file-system's FilePickerContract.
 */
internal class FolderPickerContract(private val appContextProvider: AppContextProvider) :
  AppContextActivityResultContract<FolderPickerInput, Uri?> {
  private val contentResolver: ContentResolver
    get() = requireNotNull(appContextProvider.appContext.reactContext) {
      "React Application Context is null"
    }.contentResolver

  override fun createIntent(context: Context, input: FolderPickerInput): Intent =
    Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
      Intent.FLAG_GRANT_READ_URI_PERMISSION or
        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
    )

  override fun parseResult(input: FolderPickerInput, resultCode: Int, intent: Intent?): Uri? {
    if (resultCode != Activity.RESULT_OK || intent == null) return null
    val uri = intent.data ?: return null
    val takeFlags = intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    contentResolver.takePersistableUriPermission(uri, takeFlags)
    return uri
  }
}
