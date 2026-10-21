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
    val name = FileNames.duplicateName(file.name) { File(dir, it).exists() }
    val target = File(dir, name)
    copyThenRename(Uri.fromFile(file), File(dir, ".$name.part"), target)
    return PdfFileInfos.ofFile(target, volumes())
  }

  /** Copies [source] into [part] then renames it to [target]; [part] never survives a failure. */
  private fun copyThenRename(source: Uri, part: File, target: File) {
    try {
      copy(source) { FileOutputStream(part) }
      if (!part.renameTo(target)) throw IoCodedException()
    } catch (e: Throwable) {
      part.delete()
      throw e
    }
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
    return mediaStoreInfo(uri)
  }

  private fun duplicateMediaStore(uri: Uri): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val relativePath = relativePathOf(uri) ?: APP_RELATIVE_PATH
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
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw PermissionDeniedException("Storage permission required")
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, PDF_MIME)
      put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val created = resolver.insert(MediaStore.Files.getContentUri("external"), values)
      ?: throw PermissionDeniedException("Could not create file")
    try {
      copy(source) { resolver.openOutputStream(created, "w") ?: throw IOException("No output stream") }
      publish(created)
    } catch (e: Throwable) {
      runCatching { resolver.delete(created, null, null) }
      throw e
    }
    return mediaStoreInfo(created)
  }

  /**
   * Clears IS_PENDING. A pending item is hidden and auto-deleted by the system, so if it does not
   * take effect this throws — callers then roll back instead of deleting the source.
   */
  private fun publish(created: Uri) {
    val updated = resolver.update(created, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    if (updated == 0 || isPending(created)) throw IoCodedException("Could not finish writing the file")
  }

  private fun isPending(uri: Uri): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return resolver.query(uri, arrayOf(MediaStore.MediaColumns.IS_PENDING), null, null, null)?.use { c ->
      !c.moveToFirst() || c.getInt(0) != 0
    } ?: true
  }

  private fun relativePathOf(uri: Uri): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    return resolver.query(uri, arrayOf(MediaStore.MediaColumns.RELATIVE_PATH), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }
  }

  private fun mediaStoreInfo(uri: Uri): Map<String, Any?> {
    val stat = PdfFileInfos.stat(context, uri) ?: throw FileNotFoundCodedException()
    val relativePath = relativePathOf(uri) ?: APP_RELATIVE_PATH
    val dir = File(Environment.getExternalStorageDirectory(), relativePath.trimEnd('/'))
    return PdfFileInfos.ofMediaStore(uri, stat, dir, volumes())
  }

  // endregion

  // region move with all-files access

  private fun moveWithFileAccess(source: Uri, stat: UriStat): Map<String, Any?> {
    val dir = appFolder()
    if (!dir.isDirectory && !dir.mkdirs()) throw PermissionDeniedException("Could not create the app folder")
    val sourceFile = if (source.scheme == "file") fileOf(source) else null
    if (sourceFile?.parentFile?.absolutePath == dir.absolutePath) return PdfFileInfos.ofFile(sourceFile, volumes())
    val name = FileNames.uniqueName(stat.name) { File(dir, it).exists() }
    val target = File(dir, name)
    // Same volume: a plain rename is instant and atomic.
    if (sourceFile != null && sourceFile.renameTo(target)) return PdfFileInfos.ofFile(target, volumes())
    copyThenRename(source, File(dir, ".$name.part"), target)
    try {
      deleteSource(source)
    } catch (e: Throwable) {
      target.delete()
      throw e
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
    const val PDF_MIME = "application/pdf"
    const val APP_FOLDER = "PDFToolkit"
    const val APP_RELATIVE_PATH = "Documents/PDFToolkit/"
  }
}
