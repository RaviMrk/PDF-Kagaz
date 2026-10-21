package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import java.io.File

/** Android lookups for [UriAccess]; call on a background thread (canonicalises paths). */
class UriGuard(private val context: Context) {
  /** Returns [uri] (file:// canonicalised) or throws ERR_PERMISSION_DENIED. */
  fun requireAllowed(uri: Uri): Uri {
    val file = if (uri.scheme == "file") uri.path?.let { File(it).canonicalFile } else null
    val authorityPackage = if (uri.scheme == "content") {
      uri.authority?.let { context.packageManager.resolveContentProvider(it, 0)?.packageName }
    } else {
      null
    }
    val allowed = UriAccess.isAllowed(
      scheme = uri.scheme,
      canonicalPath = file?.path,
      authorityPackage = authorityPackage,
      ownPackage = context.packageName,
      dataDir = File(context.applicationInfo.dataDir).canonicalPath,
      readerDir = File(context.cacheDir, ReaderFiles.DIR).canonicalPath,
    )
    if (!allowed) throw PermissionDeniedException()
    return if (file != null) Uri.fromFile(file) else uri
  }
}
