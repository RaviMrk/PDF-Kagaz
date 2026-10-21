package com.pdfkagaz.pdfnative

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import java.io.File
import java.io.InputStream

/** Android lookups for [UriAccess]; call on a background thread (canonicalises paths, opens files). */
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
      ownAuthorities = ownAuthorities(context),
      rules = pathRules(),
    )
    if (!allowed) throw PermissionDeniedException()
    return if (file != null) Uri.fromFile(file) else uri
  }

  /**
   * Opens an allowed file read-only, then checks what was actually opened (the kernel's path for
   * the descriptor) against the same allowlist before a byte is read: a symlink swapped in after
   * [requireAllowed] cannot redirect the read. The kernel may name a volume by an alias
   * ([KernelPaths]). Throws ERR_PERMISSION_DENIED and closes otherwise.
   */
  fun openVerified(file: File): ParcelFileDescriptor {
    val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val target = try {
      Os.readlink("/proc/self/fd/${fd.fd}")
    } catch (e: ErrnoException) {
      null
    }
    if (target == null || !KernelPaths.isShareable(target, pathRules(), realVolumeRoots())) {
      fd.close()
      throw PermissionDeniedException()
    }
    return fd
  }

  /** An input stream for an allowed URI: file:// through [openVerified], content:// via the resolver. */
  fun openInput(uri: Uri): InputStream {
    val allowed = requireAllowed(uri)
    if (allowed.scheme == "file") {
      return ParcelFileDescriptor.AutoCloseInputStream(openVerified(File(allowed.path ?: throw FileNotFoundCodedException())))
    }
    return context.contentResolver.openInputStream(allowed) ?: throw FileNotFoundCodedException()
  }

  /**
   * (kernel path, canonical path) of each mounted volume root whose kernel path differs: the
   * root is opened read-only and its descriptor's path read back, as [openVerified] sees files.
   */
  private fun realVolumeRoots(): List<Pair<String, String>> =
    Volumes.mounted(context).mapNotNull { volume ->
      val canonical = volume.root.canonicalPath
      val real = kernelPathOf(volume.root)
      if (real == null || real == canonical) null else real to canonical
    }

  private fun kernelPathOf(dir: File): String? =
    try {
      ParcelFileDescriptor.open(dir, ParcelFileDescriptor.MODE_READ_ONLY).use { Os.readlink("/proc/self/fd/${it.fd}") }
    } catch (e: Exception) {
      // ErrnoException, FileNotFoundException (no access to the root), SecurityException.
      null
    }

  private fun pathRules(): PathRules {
    val appDirs = context.getExternalFilesDirs(null).map { it?.parentFile } +
      context.externalCacheDirs.map { it?.parentFile } +
      context.obbDirs.toList()
    val cacheDirs = listOf(ReaderFiles.DIR, ShareCache.DIR).map { File(context.cacheDir, it) }
    return PathRules(
      volumeRoots = Volumes.mounted(context).map { it.root.canonicalPath },
      appDirs = appDirs.filterNotNull().map { it.canonicalPath }.distinct(),
      cacheDirs = cacheDirs.map { it.canonicalPath },
    )
  }

  private companion object {
    @Volatile
    private var ownAuthorities: Set<String>? = null

    /** Every authority this app declares (ours, blob-util's, expo's…), read once per process. */
    fun ownAuthorities(context: Context): Set<String> =
      ownAuthorities ?: run {
        val flags = PackageManager.GET_PROVIDERS or PackageManager.MATCH_DISABLED_COMPONENTS or
          PackageManager.MATCH_DIRECT_BOOT_AWARE or PackageManager.MATCH_DIRECT_BOOT_UNAWARE
        @Suppress("DEPRECATION")
        val providers = context.packageManager.getPackageInfo(context.packageName, flags).providers
        UriAccess.authoritiesOf(providers?.map { it.authority } ?: emptyList()).also { ownAuthorities = it }
      }
  }
}
