package com.pdfkagaz.pdfnative

import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/**
 * Publishes a page image from the tool workspace to Pictures/PDFToolkit/<folder>/, never
 * overwriting: API 29+ through a pending MediaStore Images item (no permission needed), API 24–28
 * as a file there when the app has storage access (then scanned into MediaStore), else
 * ERR_PERMISSION_DENIED.
 * The bytes are fsynced before the image becomes visible. The workspace file is deleted after a
 * successful publish. Errors are coded and carry no names or paths.
 */
class ImagePublisher(private val context: Context) {
  private val mediaStore = MediaStoreFiles(context)

  /** [tempUri] must be a file in a tool workspace ([ToolFiles.workspaceFile]). */
  suspend fun publish(tempUri: String, fileName: String, folder: String): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) { publish(ToolFiles.workspaceFile(context, Uri.parse(tempUri)), fileName, folder) }
  }

  /** Returns `{ uri, name }`: the saved image (a MediaStore content:// URI; file:// if a scan fails) and its final name. */
  suspend fun publish(temp: File, fileName: String, folder: String): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val name = ToolPaths.fitName(ToolPaths.cleanOutputName(fileName))
      val mime = mimeOf(name) ?: throw InvalidNameException()
      if (!FileNames.isValidName(name)) throw InvalidNameException()
      if (!temp.isFile) throw FileNotFoundCodedException()
      val relativePath = relativePathFor(folder)
      val saved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        AppFolderLock.withLock { publishToMediaStore(temp, name, mime, relativePath) }
      } else {
        if (!StorageAccess.has(context)) throw PermissionDeniedException("Storage permission required")
        val target = AppFolderLock.withLock { publishToFolder(temp, name, relativePath) }
        mapOf("uri" to scan(target, mime).toString(), "name" to target.name)
      }
      temp.delete()
      saved
    }
  }

  /** The item stays pending (hidden) until fully written and synced; MediaStore picks a free name. */
  private fun CoroutineScope.publishToMediaStore(temp: File, name: String, mime: String, relativePath: String): Map<String, Any?> {
    val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val created = mediaStore.insertPending(name, "$relativePath/", mime, collection)
    try {
      mediaStore.write(created, CancellableInput(FileInputStream(temp), this))
      mediaStore.publish(created)
    } catch (e: Throwable) {
      mediaStore.delete(created)
      throw e
    }
    // Published and visible: a failing name lookup must not fail (and duplicate on retry) the save.
    val shown = try {
      PdfFileInfos.stat(context, created)?.name
    } catch (e: Exception) {
      null
    }
    return mapOf("uri" to created.toString(), "name" to (shown ?: name))
  }

  @Suppress("DEPRECATION")
  private fun CoroutineScope.publishToFolder(temp: File, name: String, relativePath: String): File {
    val dir = File(Environment.getExternalStorageDirectory(), relativePath)
    if (!dir.isDirectory && !dir.mkdirs()) throw PermissionDeniedException("Could not create the folder")
    val claim = PartClaim.claim(dir) { taken -> ToolPaths.uniqueTarget(name, taken) }
    try {
      CancellableInput(FileInputStream(temp), this).use { input ->
        DurableWrites.writeFile(claim.part) { output -> input.copyTo(output) }
      }
      val target = claim.commit() ?: throw IoCodedException()
      DurableWrites.syncDir(dir)
      return target
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      claim.release()
    }
  }

  /**
   * Adds [file] to the gallery and returns its MediaStore content:// URI, so it is shared like an
   * API 29+ image (not through the small share cache); the file:// URI when the scan gives none
   * within [SCAN_WAIT_MS]. Blocking.
   */
  private fun scan(file: File, mime: String): Uri {
    val done = CountDownLatch(1)
    val scanned = AtomicReference<Uri?>(null)
    MediaScannerConnection.scanFile(context, arrayOf(file.path), arrayOf(mime)) { _, uri ->
      scanned.set(uri)
      done.countDown()
    }
    done.await(SCAN_WAIT_MS, TimeUnit.MILLISECONDS)
    return scanned.get() ?: Uri.fromFile(file)
  }

  /** Checks for cancellation before every read, so a cancelled job stops writing. */
  private class CancellableInput(input: InputStream, private val scope: CoroutineScope) : FilterInputStream(input) {
    override fun read(b: ByteArray, off: Int, len: Int): Int {
      scope.ensureActive()
      return super.read(b, off, len)
    }
  }

  companion object {
    const val PICTURES_ROOT = "Pictures/${MediaStoreFiles.APP_FOLDER}"
    private const val FALLBACK_FOLDER = "Images"
    private const val SCAN_WAIT_MS = 5_000L

    /**
     * "Pictures/PDFToolkit/<folder>" (no trailing slash): [folder] without control characters,
     * '/' or '\\' (→ '_'), surrounding spaces or leading dots, cut to fit a file name
     * ([ToolPaths.fitName]); [FALLBACK_FOLDER] when nothing is left.
     */
    fun relativePathFor(folder: String): String {
      val cleaned = ToolPaths.cleanOutputName(folder)
        .replace('/', '_')
        .replace('\\', '_')
        .trim()
        .trimStart('.')
        .trim()
      val fitted = ToolPaths.fitName(cleaned).trim()
      return "$PICTURES_ROOT/${fitted.ifEmpty { FALLBACK_FOLDER }}"
    }

    /** MIME type of a page image name: .jpg or .png only, else null. */
    fun mimeOf(name: String): String? = when {
      name.endsWith(".jpg", ignoreCase = true) -> "image/jpeg"
      name.endsWith(".png", ignoreCase = true) -> "image/png"
      else -> null
    }
  }
}
