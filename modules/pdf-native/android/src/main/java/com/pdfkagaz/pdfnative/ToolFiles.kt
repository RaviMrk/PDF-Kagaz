package com.pdfkagaz.pdfnative

import android.content.ContentUris
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/**
 * The private tool workspace (cacheDir/tools/<jobId>/, never exposed by the FileProvider): inputs
 * are staged into it through [UriGuard] under a size cap, outputs are published from it to
 * Documents/PDFToolkit without ever overwriting a file. Errors are coded and carry no names or paths.
 */
class ToolFiles(private val context: Context) {
  private val toolsRoot: File get() = File(context.cacheDir, ToolPaths.DIR)

  private val mediaStore = MediaStoreFiles(context)

  /** (Re)creates cacheDir/tools/<jobId>, empty; returns its file:// URI (no trailing slash). */
  suspend fun createWorkspace(jobId: String): String = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val dir = jobDir(jobId) ?: throw InvalidNameException()
      dir.deleteRecursively()
      if (!dir.mkdirs()) throw IoCodedException()
      Uri.fromFile(dir).toString()
    }
  }

  /** Copies [uri] to <job>/in-<index>.pdf; ERR_TOO_LARGE once more than [maxBytes] would be copied. */
  suspend fun stage(uri: String, jobId: String, index: Int, maxBytes: Double): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val dir = jobDir(jobId) ?: throw InvalidNameException()
      if (index < 0) throw InvalidNameException()
      // NaN or negative caps admit nothing; the cap is never skipped.
      val cap = if (maxBytes.isNaN() || maxBytes < 0) -1L else maxBytes.toLong()
      val parsed = Uri.parse(uri)
      // A file on a removed SD card is unavailable, not refused: checked before the allowlist,
      // which only knows mounted volumes. Says nothing about the file itself.
      val file = if (parsed.scheme == "file") parsed.path?.let { File(it).canonicalFile } else null
      if (file != null && Volumes.isOnUnavailableVolume(file, Volumes.mounted(context))) throw VolumeUnavailableException()
      // Refused sources fail here, before their size (ERR_TOO_LARGE) or existence could leak.
      val source = UriGuard(context).requireAllowed(parsed)
      // Missing → ERR_FILE_NOT_FOUND, or ERR_PERMISSION_DENIED when it may only be hidden (MissingFiles).
      val stat = RenderSupport.statOrThrow(context, source)
      if (ToolLimits.exceedsKnownSize(stat.sizeBytes, cap)) throw TooLargeException()
      if (!dir.isDirectory && !dir.mkdirs()) throw IoCodedException()
      val part = File(dir, "in-$index.pdf.part")
      val target = File(dir, "in-$index.pdf")
      val copied = try {
        val size = openGuarded(source).use { input ->
          FileOutputStream(part).use { output -> copyChunks(input, output, cap) }
        }
        if (!part.renameTo(target)) throw IoCodedException()
        size
      } catch (e: IOException) {
        throw IoCodedException(cause = e)
      } finally {
        if (part.exists()) part.delete()
      }
      mapOf("uri" to Uri.fromFile(target).toString(), "sizeBytes" to copied)
    }
  }

  /** Publishes a workspace file as [fileName] (or a free variant) in Documents/PDFToolkit. */
  suspend fun publish(tempUri: String, fileName: String): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val temp = workspaceFile(Uri.parse(tempUri))
      // Room for " (999)" and the part file: a long (e.g. Devanagari) name must not fail the rename.
      val name = ToolPaths.fitName(ToolPaths.cleanOutputName(fileName))
      if (!FileNames.isValidName(name) || !name.endsWith(PDF_SUFFIX)) throw InvalidNameException()
      if (!temp.isFile) throw FileNotFoundCodedException()
      val info = AppFolderLock.withLock {
        when {
          StorageAccess.has(context) -> publishToFolder(temp, name)
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> publishToMediaStore(temp, name)
          else -> throw PermissionDeniedException("Storage permission required")
        }
      }
      temp.delete()
      info
    }
  }

  /** Deletes cacheDir/tools/<jobId>; an invalid id is a no-op. */
  suspend fun cleanWorkspace(jobId: String): Unit = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      jobDir(jobId)?.deleteRecursively()
      Unit
    }
  }

  /** Deletes tool leftovers last modified before [olderThanMs]; returns how many. */
  suspend fun cleanupLeftovers(olderThanMs: Double): Int = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val cutoff = olderThanMs.toLong()
      var count = 0
      for (root in listOf(toolsRoot, File(context.cacheDir, ToolPaths.THUMB_DIR))) {
        for (entry in root.listFiles() ?: emptyArray()) {
          ensureActive()
          if (entry.lastModified() < cutoff && entry.deleteRecursively()) count++
        }
      }
      // Under the lock: never a part file or pending item of a publish or move in progress.
      AppFolderLock.withLock {
        if (StorageAccess.has(context)) count += quietly { deleteLeftoverParts(cutoff) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) count += quietly { deletePendingItems(cutoff) }
      }
      count
    }
  }

  // region publish

  private fun CoroutineScope.publishToFolder(temp: File, fileName: String): Map<String, Any?> {
    val dir = appFolder()
    if (!dir.isDirectory && !dir.mkdirs()) throw PermissionDeniedException("Could not create the app folder")
    val claim = PartClaim.claim(dir) { taken -> ToolPaths.uniqueTarget(fileName, taken) }
    try {
      FileInputStream(temp).use { input ->
        FileOutputStream(claim.part).use { output ->
          copyChunks(input, output, Long.MAX_VALUE)
          output.fd.sync()
        }
      }
      val target = claim.commit() ?: throw IoCodedException()
      MediaScannerConnection.scanFile(context, arrayOf(target.path), arrayOf(MediaStoreFiles.PDF_MIME), null)
      return PdfFileInfos.ofFile(target, Volumes.mounted(context))
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      claim.release()
    }
  }

  /** MediaStore picks a free name itself; the item stays pending (hidden) until fully written. */
  private fun CoroutineScope.publishToMediaStore(temp: File, fileName: String): Map<String, Any?> {
    val created = mediaStore.insertPending(fileName, MediaStoreFiles.APP_RELATIVE_PATH)
    try {
      mediaStore.write(created, CancellableInput(FileInputStream(temp), this))
      mediaStore.publish(created)
    } catch (e: Throwable) {
      mediaStore.delete(created)
      throw e
    }
    // Published and visible: reporting a failure now would make a retry duplicate it.
    return try {
      mediaStore.info(created)
    } catch (e: Exception) {
      val dir = File(Environment.getExternalStorageDirectory(), MediaStoreFiles.APP_RELATIVE_PATH.trimEnd('/'))
      PdfFileInfos.ofMediaStore(created, UriStat(fileName, temp.length(), System.currentTimeMillis()), dir, Volumes.mounted(context))
    }
  }

  // endregion

  // region leftovers

  private fun deleteLeftoverParts(cutoff: Long): Int {
    val parts = appFolder().listFiles()?.filter { it.isFile && ToolPaths.isLeftoverPart(it.name) && it.lastModified() < cutoff }
    return parts?.count { it.delete() } ?: 0
  }

  /** This app's pending items in Documents/PDFToolkit/ added before [cutoff] (API 30+). */
  private fun deletePendingItems(cutoff: Long): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return 0
    val filesUri = MediaStore.Files.getContentUri("external")
    val args = Bundle().apply {
      putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_ONLY)
      putString(
        android.content.ContentResolver.QUERY_ARG_SQL_SELECTION,
        "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ? AND " +
          "${MediaStore.MediaColumns.DATE_ADDED} < ?",
      )
      putStringArray(
        android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
        arrayOf(MediaStoreFiles.APP_RELATIVE_PATH, context.packageName, (cutoff / 1000).toString()),
      )
    }
    val ids = ArrayList<Long>()
    context.contentResolver.query(filesUri, arrayOf(MediaStore.MediaColumns._ID), args, null)?.use { c ->
      while (c.moveToNext()) ids.add(c.getLong(0))
    }
    return ids.count { context.contentResolver.delete(ContentUris.withAppendedId(filesUri, it), null, null) > 0 }
  }

  /** A failing cleanup step (revoked access, provider error) counts nothing; cancellation propagates. */
  private inline fun quietly(block: () -> Int): Int =
    try {
      block()
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      0
    }

  // endregion

  /** cacheDir/tools/<jobId>, or null for an invalid id. */
  private fun jobDir(jobId: String): File? = if (ToolPaths.isValidJobId(jobId)) File(toolsRoot, jobId) else null

  /** The file a file:// URI names, only when it canonically lies inside a job workspace. */
  private fun workspaceFile(uri: Uri): File {
    val path = if (uri.scheme == "file") uri.path else null
    val canonical = path?.let { File(it).canonicalPath } ?: throw PermissionDeniedException()
    if (!ToolPaths.isWorkspaceFile(toolsRoot.canonicalPath, canonical)) throw PermissionDeniedException()
    return File(canonical)
  }

  /** file:// opened then verified, content:// own providers refused ([UriGuard]); read-only. */
  private fun openGuarded(uri: Uri): InputStream =
    try {
      UriGuard(context).openInput(uri)
    } catch (e: java.io.FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    } catch (e: IllegalArgumentException) {
      // Unknown document id.
      throw FileNotFoundCodedException(cause = e)
    }

  /** Copies in [BUFFER_BYTES] chunks, cancellable; ERR_TOO_LARGE once more than [cap] bytes arrive. */
  private fun CoroutineScope.copyChunks(input: InputStream, output: OutputStream, cap: Long): Long {
    val buffer = ByteArray(BUFFER_BYTES)
    var copied = 0L
    while (true) {
      ensureActive()
      val read = input.read(buffer)
      if (read < 0) return copied
      copied += read
      if (ToolLimits.exceedsCopied(copied, cap)) throw TooLargeException()
      output.write(buffer, 0, read)
    }
  }

  /** Checks for cancellation before every read, so a MediaStore write stops when its job is cancelled. */
  private class CancellableInput(input: InputStream, private val scope: CoroutineScope) : FilterInputStream(input) {
    override fun read(b: ByteArray, off: Int, len: Int): Int {
      scope.ensureActive()
      return super.read(b, off, len)
    }
  }

  @Suppress("DEPRECATION")
  private fun appFolder(): File =
    File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), MediaStoreFiles.APP_FOLDER)

  private companion object {
    const val BUFFER_BYTES = 256 * 1024
    const val PDF_SUFFIX = ".pdf"
  }
}
