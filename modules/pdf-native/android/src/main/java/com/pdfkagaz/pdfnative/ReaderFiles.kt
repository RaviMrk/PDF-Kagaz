package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Gives the reader a percent-encoded file:// URI for any source: file:// sources as they are,
 * content:// sources as a bounded cache copy (cacheDir/reader). Sources are only ever read.
 */
class ReaderFiles(private val context: Context) {
  /** A ReaderFile map (see PdfNative.types.ts). */
  suspend fun prepare(uri: String): Map<String, Any?> = RenderSupport.mapErrors {
    withContext(Dispatchers.IO) {
      val parsed = Uri.parse(uri)
      if (parsed.scheme == "file") prepareFile(parsed) else copyLock.withLock { prepareContent(uri, parsed) }
    }
  }

  private fun prepareFile(uri: Uri): Map<String, Any?> {
    // Throws ERR_VOLUME_UNAVAILABLE for a file on an unmounted volume.
    val stat = RenderSupport.statOrThrow(context, uri)
    val file = File(uri.path ?: throw FileNotFoundCodedException())
    if (!file.canRead()) throw PermissionDeniedException()
    return readerFile(file, copied = false, sizeBytes = stat.sizeBytes)
  }

  /** Runs under [copyLock]: the eviction below deletes stray .part files, never one being written. */
  private fun CoroutineScope.prepareContent(uri: String, parsed: Uri): Map<String, Any?> {
    val stat = RenderSupport.statOrThrow(context, parsed)
    val dir = File(context.cacheDir, DIR).apply { mkdirs() }
    val target = File(dir, ReaderCache.fileNameFor(uri, stat.sizeBytes, stat.modifiedAt))
    if (ReaderCache.reusable(stat.modifiedAt) && target.isFile && target.length() == stat.sizeBytes) {
      target.setLastModified(System.currentTimeMillis())
    } else {
      copy(parsed, File(dir, "${target.name}.part"), target)
    }
    evict(dir, keep = target.name)
    return readerFile(target, copied = true, sizeBytes = target.length())
  }

  private fun CoroutineScope.copy(source: Uri, part: File, target: File) {
    try {
      openInput(source).use { input ->
        FileOutputStream(part).use { output ->
          val buffer = ByteArray(BUFFER_BYTES)
          while (true) {
            ensureActive()
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
          }
        }
      }
      if (!part.renameTo(target)) throw IoCodedException()
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      if (part.exists()) part.delete()
    }
  }

  private fun openInput(uri: Uri): InputStream =
    try {
      context.contentResolver.openInputStream(uri) ?: throw FileNotFoundCodedException()
    } catch (e: java.io.FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    } catch (e: IllegalArgumentException) {
      // Unknown document id.
      throw FileNotFoundCodedException(cause = e)
    }

  private fun evict(dir: File, keep: String) {
    val entries = dir.listFiles()?.map { CacheEntry(it.name, it.lastModified(), it.length()) } ?: return
    for (name in ReaderCache.toDelete(entries, keep)) File(dir, name).delete()
  }

  private fun readerFile(file: File, copied: Boolean, sizeBytes: Long): Map<String, Any?> =
    mapOf("uri" to Uri.fromFile(file).toString(), "copied" to copied, "sizeBytes" to sizeBytes)

  private companion object {
    const val DIR = "reader"
    const val BUFFER_BYTES = 256 * 1024

    /** One copy at a time, so eviction never removes another call's in-progress .part file. */
    val copyLock = Mutex()
  }
}
