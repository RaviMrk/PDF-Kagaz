package com.pdfkagaz.pdfnative

import android.graphics.Bitmap
import android.net.Uri
import java.io.File
import java.io.IOException
import java.security.SecureRandom

/**
 * Saved signature PNGs live directly in filesDir/[DIR] as `sig-<epochMs>-<rand6>.png`. Only such
 * files can be deleted from JS. Blocking; errors never carry a path.
 */
object SignatureFiles {
  const val DIR = "signatures"

  private val NAME = Regex("^sig-[0-9]+-[a-z0-9]{6}\\.png$")
  private const val ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
  private val random = SecureRandom()

  /** True for a `sig-*.png` directly in [filesDir]/[DIR] ([canonicalPath] must be canonical). */
  fun isSignatureFile(filesDir: File, canonicalPath: String): Boolean {
    val parent = File(filesDir, DIR).path.trimEnd('/') + "/"
    if (!canonicalPath.startsWith(parent)) return false
    val name = canonicalPath.substring(parent.length)
    return !name.contains('/') && NAME.matches(name)
  }

  fun newName(epochMs: Long, suffix: String): String = "sig-$epochMs-$suffix.png"

  fun randomSuffix(): String = buildString { repeat(6) { append(ALPHABET[random.nextInt(ALPHABET.length)]) } }

  /**
   * Deletes the signature PNG at file:// [uri]; anything that is not a signature file →
   * ERR_PERMISSION_DENIED. A file that is already gone resolves.
   */
  fun delete(filesDir: File, uri: String) {
    val path = try {
      Uri.parse(uri).takeIf { it.scheme == "file" }?.path
    } catch (_: Exception) {
      null
    } ?: throw PermissionDeniedException()
    val file = try {
      File(path).canonicalFile
    } catch (_: IOException) {
      throw PermissionDeniedException()
    }
    if (!isSignatureFile(filesDir.canonicalFile, file.path)) throw PermissionDeniedException()
    if (file.exists() && !file.delete()) throw IoCodedException()
  }

  /**
   * Writes [bitmap] as [newName]`(epochMs, suffix)` in filesDir/[DIR]: into a part file, fsynced,
   * then renamed, so a saved signature is never a truncated PNG.
   */
  fun writePng(filesDir: File, bitmap: Bitmap, epochMs: Long, suffix: String): File {
    val dir = File(filesDir, DIR)
    if (!dir.isDirectory && !dir.mkdirs()) throw IoCodedException()
    val target = File(dir, newName(epochMs, suffix))
    val part = File(dir, ToolPaths.partName(target.name))
    try {
      val written = DurableWrites.writeFile(part) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      if (!written || !part.renameTo(target)) throw IoCodedException()
      DurableWrites.syncDir(dir)
      return target
    } catch (e: IOException) {
      throw IoCodedException(cause = e)
    } finally {
      if (part.exists()) part.delete()
    }
  }
}
