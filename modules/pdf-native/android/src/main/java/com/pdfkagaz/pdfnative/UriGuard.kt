package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import java.io.File

/** Android lookups for [UriAccess]; call on a background thread (canonicalises paths). */
class UriGuard(private val context: Context) {
  /** Canonical cacheDir/reader. */
  val readerDir: String
    get() = File(context.cacheDir, ReaderFiles.DIR).canonicalPath

  /** Returns [uri] (file:// canonicalised) or throws ERR_PERMISSION_DENIED. */
  fun requireAllowed(uri: Uri): Uri {
    val file = if (uri.scheme == "file") uri.path?.let { File(it).canonicalFile } else null
    val authority = if (uri.scheme == "content") uri.encodedAuthority else null
    val authorityPackage = uri.authority?.takeIf { authority != null }?.let {
      context.packageManager.resolveContentProvider(it, 0)?.packageName
    }
    val allowed = UriAccess.isAllowed(
      scheme = uri.scheme,
      canonicalPath = file?.path,
      authority = authority,
      authorityPackage = authorityPackage,
      ownPackage = context.packageName,
      privateDirs = privateDirs(),
      readerDir = readerDir,
    )
    if (!allowed) throw PermissionDeniedException()
    return if (file != null) Uri.fromFile(file) else uri
  }

  /** Data, device-protected data (API 24) and Android/data, Android/obb on every volume. */
  private fun privateDirs(): List<String> {
    val info = context.applicationInfo
    val external = context.getExternalFilesDirs(null).map { it?.parentFile } +
      context.externalCacheDirs.map { it?.parentFile } +
      context.obbDirs.toList()
    return (listOfNotNull(info.dataDir, info.deviceProtectedDataDir).map(::File) + external.filterNotNull())
      .map { it.canonicalPath }
      .distinct()
  }
}
