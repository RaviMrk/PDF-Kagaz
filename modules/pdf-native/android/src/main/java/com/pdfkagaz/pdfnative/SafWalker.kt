package com.pdfkagaz.pdfnative

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document

/**
 * Walks a SAF tree grant with [DocumentsContract] queries, applying the same [ScanRules] as
 * [PdfWalker]. Returns PdfFileInfo maps. A [SecurityException] (revoked grant) or an unreadable
 * root propagates / throws so the caller can mark the root as failed.
 */
class SafWalker(
  private val resolver: ContentResolver,
  private val onProgress: (scannedFolders: Int, found: Int) -> Unit = { _, _ -> },
) {
  private class Dir(val docId: String, val relPath: String, val modifiedAt: Long)

  fun walk(treeUri: Uri): List<Map<String, Any?>> {
    val rootId = DocumentsContract.getTreeDocumentId(treeUri)
    val rootUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootId)
    var label = ""
    var rootModified = 0L
    resolver.query(rootUri, arrayOf(Document.COLUMN_DISPLAY_NAME, Document.COLUMN_LAST_MODIFIED), null, null, null)
      ?.use { c ->
        if (!c.moveToFirst()) throw SafRootUnreadableException()
        label = c.getString(0) ?: ""
        rootModified = if (c.isNull(1)) 0L else c.getLong(1)
      } ?: throw SafRootUnreadableException()

    val found = ArrayList<Map<String, Any?>>()
    val visited = HashSet<String>()
    val stack = ArrayDeque<Dir>()
    stack.addLast(Dir(rootId, "", rootModified))
    var scannedFolders = 0
    while (stack.isNotEmpty()) {
      val dir = stack.removeLast()
      if (!visited.add(dir.docId)) continue
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, dir.docId)
      val cursor = resolver.query(childrenUri, PROJECTION, null, null, null)
      if (cursor == null) {
        if (dir.docId == rootId) throw SafRootUnreadableException()
        continue
      }
      scannedFolders++
      val parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, dir.docId).toString()
      val folder = if (dir.relPath.isEmpty()) label else "$label/${dir.relPath}"
      cursor.use { c ->
        while (c.moveToNext()) {
          val docId = c.getString(0) ?: continue
          val name = c.getString(1) ?: continue
          val mime = c.getString(2)
          val size = if (c.isNull(3)) 0L else c.getLong(3)
          val modified = if (c.isNull(4)) 0L else c.getLong(4)
          if (mime == Document.MIME_TYPE_DIR) {
            val childRel = if (dir.relPath.isEmpty()) name else "${dir.relPath}/$name"
            if (!ScanRules.shouldSkipDir(name, childRel)) stack.addLast(Dir(docId, childRel, modified))
          } else if (!name.startsWith(".") && (mime == "application/pdf" || ScanRules.isPdf(name))) {
            found.add(
              mapOf(
                "uri" to DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString(),
                "name" to name,
                "folder" to folder,
                "parentUri" to parentUri,
                "parentModifiedAt" to dir.modifiedAt,
                "sizeBytes" to size,
                "modifiedAt" to modified,
              ),
            )
          }
        }
      }
      onProgress(scannedFolders, found.size)
    }
    return found
  }

  class SafRootUnreadableException : Exception()

  private companion object {
    val PROJECTION = arrayOf(
      Document.COLUMN_DOCUMENT_ID,
      Document.COLUMN_DISPLAY_NAME,
      Document.COLUMN_MIME_TYPE,
      Document.COLUMN_SIZE,
      Document.COLUMN_LAST_MODIFIED,
    )
  }
}
