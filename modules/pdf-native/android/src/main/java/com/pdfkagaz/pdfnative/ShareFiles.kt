package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Copies a file:// PDF into cacheDir/share/<hash>/<display name> so [PdfNativeFileProvider] only
 * ever exposes cache paths. The source is only read; the cache is bounded ([ShareCache]).
 * Call on an IO dispatcher.
 */
class ShareFiles(private val context: Context) {
  suspend fun copyOf(file: File, stat: UriStat): File = copyLock.withLock {
    coroutineScope { copyLocked(file, stat) }
  }

  private fun CoroutineScope.copyLocked(file: File, stat: UriStat): File {
    val root = File(context.cacheDir, ShareCache.DIR).apply { mkdirs() }
    val dirName = ShareCache.dirNameFor(Uri.fromFile(file).toString(), stat.sizeBytes, stat.modifiedAt)
    val name = ShareCache.fileNameFor(stat.name)
    val dir = File(root, dirName)
    val target = File(dir, name)
    if (target.isFile && target.length() == stat.sizeBytes) {
      dir.setLastModified(System.currentTimeMillis())
    } else {
      copy(file, File(root, "$dirName${ShareCache.PART_SUFFIX}"), name, dir)
    }
    evict(root, keep = dirName)
    return target
  }

  private fun CoroutineScope.copy(source: File, part: File, name: String, dir: File) {
    try {
      part.deleteRecursively()
      if (!part.mkdirs()) throw IoCodedException()
      // Verified after opening: the descriptor must still point inside the allowlist.
      ParcelFileDescriptor.AutoCloseInputStream(UriGuard(context).openVerified(source)).use { input ->
        FileOutputStream(File(part, name)).use { output ->
          val buffer = ByteArray(BUFFER_BYTES)
          while (true) {
            ensureActive()
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
          }
        }
      }
      dir.deleteRecursively()
      if (!part.renameTo(dir)) throw IoCodedException()
    } catch (e: java.io.FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      if (part.exists()) part.deleteRecursively()
    }
  }

  private fun evict(root: File, keep: String) {
    val entries = root.listFiles()?.map { CacheEntry(it.name, it.lastModified(), sizeOf(it)) } ?: return
    for (name in ShareCache.toDelete(entries, keep)) File(root, name).deleteRecursively()
  }

  private fun sizeOf(entry: File): Long = entry.walkTopDown().filter { it.isFile }.sumOf { it.length() }

  companion object {
    const val BUFFER_BYTES = 256 * 1024

    /** One copy at a time, so eviction never removes another call's in-progress .part dir. */
    val copyLock = Mutex()
  }
}
