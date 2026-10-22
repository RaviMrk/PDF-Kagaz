package com.pdfkagaz.pdfnative

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * Rename / delete / duplicate / move-to-app-folder for the three URI kinds the app holds:
 * file:// (all-files access), tree-based SAF documents, and MediaStore items created by
 * [moveToAppFolder] without full access. Blocking — call off the main thread.
 */
class FileOps(private val context: Context, private val hasAllFilesAccess: () -> Boolean) {
  private val resolver get() = context.contentResolver
  private val mediaStore = MediaStoreFiles(context)

  fun rename(uri: String, newName: String): Map<String, Any?> = mapErrors {
    if (!FileNames.isValidName(newName)) throw InvalidNameException()
    val parsed = Uri.parse(uri)
    when {
      parsed.scheme == "file" -> renameFile(fileOf(parsed), newName)
      DocumentsContract.isDocumentUri(context, parsed) -> renameDocument(parsed, newName)
      else -> renameMediaStore(parsed, newName)
    }
  }

  fun delete(uri: String): Unit = mapErrors {
    val parsed = Uri.parse(uri)
    when {
      parsed.scheme == "file" -> {
        val file = fileOf(parsed)
        if (!file.exists()) {
          // Already gone, unless its volume (SD card) is just not mounted.
          if (Volumes.isOnUnavailableVolume(file, volumes())) throw VolumeUnavailableException()
        } else if (!file.delete()) {
          throw PermissionDeniedException("Could not delete file")
        }
      }
      DocumentsContract.isDocumentUri(context, parsed) -> {
        if (PdfFileInfos.stat(context, parsed) == null) return@mapErrors
        try {
          DocumentsContract.deleteDocument(resolver, parsed)
        } catch (e: java.io.FileNotFoundException) {
          // Already gone.
        }
      }
      else -> resolver.delete(parsed, null, null)
    }
  }

  fun duplicate(uri: String, parentUri: String): Map<String, Any?> = mapErrors {
    val parsed = Uri.parse(uri)
    when {
      parsed.scheme == "file" -> duplicateFile(fileOf(parsed))
      DocumentsContract.isDocumentUri(context, parsed) -> duplicateDocument(parsed, Uri.parse(parentUri))
      else -> duplicateMediaStore(parsed)
    }
  }

  fun moveToAppFolder(uri: String): Map<String, Any?> = mapErrors {
    val source = Uri.parse(uri)
    val stat = PdfFileInfos.stat(context, source) ?: throw FileNotFoundCodedException()
    if (hasAllFilesAccess()) {
      moveWithFileAccess(source, stat)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      moveViaMediaStore(source, stat)
    } else {
      throw PermissionDeniedException("Storage permission required")
    }
  }

  // region file://

  private fun renameFile(file: File, newName: String): Map<String, Any?> {
    if (!file.isFile) throw Volumes.missingFileError(file, volumes())
    val dir = file.parentFile ?: throw PermissionDeniedException()
    if (newName != file.name) {
      val target = File(dir, newName)
      val caseOnly = newName.equals(file.name, ignoreCase = true)
      if (!caseOnly && target.exists()) throw FileExistsException()
      val renamed = if (caseOnly) renameViaTemp(file, target) else file.renameTo(target)
      if (!renamed) throw PermissionDeniedException("Could not rename file")
      return PdfFileInfos.ofFile(target, volumes())
    }
    return PdfFileInfos.ofFile(file, volumes())
  }

  /** Case-only rename on case-insensitive shared storage: go through a temporary name. */
  private fun renameViaTemp(file: File, target: File): Boolean {
    val temp = File(file.parentFile, ".${file.name}.rename")
    if (!file.renameTo(temp)) return false
    if (temp.renameTo(target)) return true
    temp.renameTo(file)
    return false
  }

  private fun duplicateFile(file: File): Map<String, Any?> {
    if (!file.isFile) throw Volumes.missingFileError(file, volumes())
    val dir = file.parentFile ?: throw PermissionDeniedException()
    val target = AppFolderLock.withLock {
      copyClaimed(Uri.fromFile(file), PartClaim.claim(dir) { taken -> FileNames.duplicateName(file.name, taken) })
    }
    return PdfFileInfos.ofFile(target, volumes())
  }

  /** Copies [source] into the claimed part then renames it into place; the part never survives a failure. */
  private fun copyClaimed(source: Uri, claim: PartClaim): File =
    try {
      copy(source) { FileOutputStream(claim.part) }
      claim.commit() ?: throw IoCodedException()
    } finally {
      claim.release()
    }

  // endregion

  // region SAF

  private fun renameDocument(uri: Uri, newName: String): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val location = PdfFileInfos.safLocation(context, uri)
    if (newName == stat.name) return PdfFileInfos.ofDocument(uri, stat, location)
    if (location != null && !newName.equals(stat.name, ignoreCase = true)) {
      // Providers silently pick a unique name instead of failing; check first.
      if (childNames(Uri.parse(location.parentUri)).contains(newName)) throw FileExistsException()
    }
    val renamed = DocumentsContract.renameDocument(resolver, uri, newName) ?: uri
    val newStat = PdfFileInfos.stat(context, renamed) ?: throw FileNotFoundCodedException()
    return PdfFileInfos.ofDocument(renamed, newStat, location)
  }

  private fun duplicateDocument(uri: Uri, parentUri: Uri): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val taken = childNames(parentUri)
    val name = FileNames.duplicateName(stat.name) { it in taken }
    val created = DocumentsContract.createDocument(resolver, parentUri, PDF_MIME, name)
      ?: throw PermissionDeniedException("Could not create document")
    try {
      copy(uri) { resolver.openOutputStream(created, "w") ?: throw IOException("No output stream") }
    } catch (e: Throwable) {
      runCatching { DocumentsContract.deleteDocument(resolver, created) }
      throw e
    }
    val newStat = PdfFileInfos.stat(context, created) ?: throw FileNotFoundCodedException()
    return PdfFileInfos.ofDocument(created, newStat, PdfFileInfos.safFolder(context, parentUri))
  }

  private fun childNames(parentUri: Uri): Set<String> {
    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(parentUri, DocumentsContract.getDocumentId(parentUri))
    val names = HashSet<String>()
    resolver.query(childrenUri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
      while (c.moveToNext()) c.getString(0)?.let(names::add)
    }
    return names
  }

  // endregion

  // region MediaStore

  private fun renameMediaStore(uri: Uri, newName: String): Map<String, Any?> {
    PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val values = ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, newName) }
    if (resolver.update(uri, values, null, null) == 0) throw PermissionDeniedException("Could not rename file")
    return mediaStore.info(uri)
  }

  private fun duplicateMediaStore(uri: Uri): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val relativePath = mediaStore.relativePathOf(uri) ?: APP_RELATIVE_PATH
    // MediaStore makes the name unique if it is taken.
    return insertIntoMediaStore(uri, FileNames.duplicateName(stat.name) { false }, relativePath)
  }

  private fun moveViaMediaStore(source: Uri, stat: UriStat): Map<String, Any?> {
    val info = insertIntoMediaStore(source, stat.name, APP_RELATIVE_PATH)
    try {
      deleteSource(source)
    } catch (e: Throwable) {
      runCatching { resolver.delete(Uri.parse(info["uri"] as String), null, null) }
      throw e
    }
    return info
  }

  private fun insertIntoMediaStore(source: Uri, name: String, relativePath: String): Map<String, Any?> {
    val created = mediaStore.insertPending(name, relativePath)
    try {
      mediaStore.write(created, resolver.openInputStream(source) ?: throw FileNotFoundCodedException())
      mediaStore.publish(created)
    } catch (e: Throwable) {
      mediaStore.delete(created)
      throw e
    }
    return mediaStore.info(created)
  }

  // endregion

  // region move with all-files access

  private fun moveWithFileAccess(source: Uri, stat: UriStat): Map<String, Any?> {
    val dir = appFolder()
    if (!dir.isDirectory && !dir.mkdirs()) throw PermissionDeniedException("Could not create the app folder")
    val sourceFile = if (source.scheme == "file") fileOf(source) else null
    if (sourceFile?.parentFile?.absolutePath == dir.absolutePath) return PdfFileInfos.ofFile(sourceFile, volumes())
    val target = AppFolderLock.withLock {
      // In-flight part files (a tool publish, another move) count as taken.
      val name = ToolPaths.uniqueTarget(stat.name) { File(dir, it).exists() }
      val renamed = File(dir, name)
      // Same volume: a plain rename is instant and atomic.
      if (sourceFile != null && sourceFile.renameTo(renamed)) return@withLock renamed
      val copied = copyClaimed(source, PartClaim.claim(dir) { taken -> ToolPaths.uniqueTarget(stat.name, taken) })
      try {
        deleteSource(source)
      } catch (e: Throwable) {
        copied.delete()
        throw e
      }
      copied
    }
    return PdfFileInfos.ofFile(target, volumes())
  }

  @Suppress("DEPRECATION")
  private fun appFolder(): File =
    File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), APP_FOLDER)

  // endregion

  private fun deleteSource(source: Uri) {
    val deleted = when {
      source.scheme == "file" -> fileOf(source).delete()
      DocumentsContract.isDocumentUri(context, source) -> DocumentsContract.deleteDocument(resolver, source)
      else -> resolver.delete(source, null, null) > 0
    }
    if (!deleted) throw PermissionDeniedException("Could not remove the original file")
  }

  private fun copy(source: Uri, openOutput: () -> java.io.OutputStream) {
    val input = resolver.openInputStream(source) ?: throw FileNotFoundCodedException()
    input.use { inp -> openOutput().use { out -> inp.copyTo(out) } }
  }

  private fun fileOf(uri: Uri): File = File(uri.path ?: throw FileNotFoundCodedException())

  private fun volumes() = Volumes.mounted(context)

  /** Maps platform failures to the module's coded errors; coded errors pass through. */
  private inline fun <T> mapErrors(block: () -> T): T =
    try {
      block()
    } catch (e: CodedException) {
      throw e
    } catch (e: java.io.FileNotFoundException) {
      throw FileNotFoundCodedException(cause = e)
    } catch (e: SecurityException) {
      throw PermissionDeniedException(cause = e)
    } catch (e: Exception) {
      // IOException (disk full, provider failure) and provider runtime errors, whose messages
      // often contain paths: surface a fixed message instead.
      throw IoCodedException(cause = e)
    }

  private companion object {
    const val PDF_MIME = MediaStoreFiles.PDF_MIME
    const val APP_FOLDER = MediaStoreFiles.APP_FOLDER
    const val APP_RELATIVE_PATH = MediaStoreFiles.APP_RELATIVE_PATH
  }
}
