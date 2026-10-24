package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import java.io.File
import java.util.UUID

/**
 * Password protection of PDFs with PdfBox. Locks: "none" (not encrypted), "open" (encrypted, but the
 * empty password allows changes), "password" (a user password is needed), "restricted" (opens
 * without a password but forbids changes). A decrypted copy is made only when the opening password
 * gives owner permission, or allows modifying, assembling and extracting; otherwise
 * ERR_PASSWORD_RESTRICTED, so restrictions are never bypassed. Passwords never reach a log or an
 * error message. Disk work: call on Dispatchers.IO.
 */
class PdfSecurity(private val context: Context) {
  /** The lock of [uri] (a job workspace file, or a source [UriGuard] allows), read in place. */
  fun inspect(uri: Uri): String = withSource(uri) { file, tempDir -> inspectFile(file, tempDir) }

  /** Whether [password] opens [uri] with permission to change it: "ok" | "wrong" | "restricted". */
  fun check(uri: Uri, password: String): String = withSource(uri) { file, tempDir -> checkFile(file, password, tempDir) }

  /**
   * Writes the decrypted copy of workspace file [fileUri] of job [jobId] as `in-<index>.open.pdf`
   * next to it ([unlockTo]); [check] throws ERR_CANCELLED once the job was cancelled. Anything but
   * a file of that job's workspace → ERR_PERMISSION_DENIED.
   */
  fun unlockWorkspaceInput(fileUri: Uri, jobId: String, index: Int, password: String?, check: () -> Unit): Map<String, Any?> {
    if (!ToolPaths.isValidJobId(jobId) || index < 0) throw InvalidNameException()
    val source = ToolFiles.workspaceFile(context, fileUri)
    val dir = source.parentFile ?: throw PermissionDeniedException()
    if (dir.name != jobId) throw PermissionDeniedException()
    if (!source.isFile) throw FileNotFoundCodedException()
    val target = File(dir, "in-$index.open.pdf")
    val tempDir = File(dir, "pdfbox-$index")
    try {
      check()
      unlockTo(source, target, password, tempDir)
      check()
    } finally {
      tempDir.deleteRecursively()
    }
    return mapOf("uri" to Uri.fromFile(target).toString(), "sizeBytes" to target.length())
  }

  /**
   * Writes workspace file [fileUri] (not encrypted) of job [jobId] as `out-protected.pdf` next to it
   * ([protectTo]); [check] throws ERR_CANCELLED once the job was cancelled. Anything but a file of
   * that job's workspace → ERR_PERMISSION_DENIED. The password is never logged or put in an error.
   */
  fun protectWorkspaceInput(fileUri: Uri, jobId: String, password: String, check: () -> Unit): Map<String, Any?> {
    if (!ToolPaths.isValidJobId(jobId)) throw InvalidNameException()
    val source = ToolFiles.workspaceFile(context, fileUri)
    val dir = source.parentFile ?: throw PermissionDeniedException()
    if (dir.name != jobId) throw PermissionDeniedException()
    if (!source.isFile) throw FileNotFoundCodedException()
    val target = File(dir, "out-protected.pdf")
    val tempDir = File(dir, "pdfbox-protect")
    try {
      check()
      protectTo(source, target, password, tempDir)
      check()
    } finally {
      tempDir.deleteRecursively()
    }
    return mapOf("uri" to Uri.fromFile(target).toString(), "sizeBytes" to target.length())
  }

  /**
   * Runs [block] on [uri] opened read-only through a descriptor (`/proc/self/fd/<n>`), so a source
   * is never copied in full; PdfBox spills to a temp dir in the tools cache, deleted afterwards.
   */
  private fun <T> withSource(uri: Uri, block: (File, File) -> T): T {
    val tempDir = File(File(context.cacheDir, ToolPaths.DIR), "lock-${UUID.randomUUID()}")
    try {
      return openSource(uri).use { fd ->
        // A descriptor from a content provider cannot be reopened through /proc (the app may not
        // be allowed to open that path itself): its bytes go to a scratch copy, deleted afterwards.
        if (uri.scheme == "content") {
          tempDir.mkdirs()
          val copy = File(tempDir, "source.pdf")
          java.io.FileInputStream(fd.fileDescriptor).use { input -> copy.outputStream().use { input.copyTo(it) } }
          block(copy, tempDir)
        } else {
          block(File("/proc/self/fd/${fd.fd}"), tempDir)
        }
      }
    } finally {
      tempDir.deleteRecursively()
    }
  }

  private fun openSource(uri: Uri): ParcelFileDescriptor {
    val workspace = try {
      ToolFiles.workspaceFile(context, uri)
    } catch (_: PermissionDeniedException) {
      null
    }
    if (workspace != null) {
      if (!workspace.isFile) throw FileNotFoundCodedException()
      return ParcelFileDescriptor.open(workspace, ParcelFileDescriptor.MODE_READ_ONLY)
    }
    val guard = UriGuard(context)
    val allowed = guard.requireAllowed(uri)
    if (allowed.scheme == "file") {
      val file = File(allowed.path ?: throw FileNotFoundCodedException())
      if (!file.isFile) throw FileNotFoundCodedException()
      return guard.openVerified(file)
    }
    return RenderSupport.openFd(context, allowed)
  }

  companion object {
    /** The lock of [file]; damaged → ERR_PDF_INVALID. */
    fun inspectFile(file: File, tempDir: File): String {
      val doc = try {
        PdfBoxSupport.open(file, null, tempDir)
      } catch (e: PdfEncryptedException) {
        return "password"
      }
      return doc.use {
        when {
          !it.isEncrypted -> "none"
          allowsChanges(it) -> "open"
          else -> "restricted"
        }
      }
    }

    /** "ok" when [password] opens [file] with permission to change it, "wrong", or "restricted". */
    fun checkFile(file: File, password: String, tempDir: File): String {
      val doc = try {
        PdfBoxSupport.open(file, password, tempDir)
      } catch (e: PasswordWrongException) {
        return "wrong"
      }
      return doc.use { if (!it.isEncrypted || allowsChanges(it)) "ok" else "restricted" }
    }

    /**
     * Writes a copy of [source] without encryption to [target] (through a part file). A null
     * [password] tries the empty one: ERR_PDF_ENCRYPTED when a password is needed,
     * ERR_PASSWORD_WRONG when it does not open, ERR_PASSWORD_RESTRICTED when it opens without
     * permission to change the file.
     */
    fun unlockTo(source: File, target: File, password: String?, tempDir: File) {
      PdfBoxSupport.open(source, password, tempDir).use { doc ->
        if (doc.isEncrypted && !allowsChanges(doc)) throw PasswordRestrictedException()
        doc.isAllSecurityToBeRemoved = true
        PdfBoxSupport.saveTo(doc, target)
      }
    }

    /**
     * Writes [source] (not encrypted) to [target] encrypted with AES-256; [password] opens it and
     * is also its owner password, with every permission allowed.
     */
    fun protectTo(source: File, target: File, password: String, tempDir: File) {
      PdfBoxSupport.open(source, null, tempDir).use { doc ->
        val policy = StandardProtectionPolicy(password, password, AccessPermission())
        policy.encryptionKeyLength = AES_KEY_BITS
        PdfBoxSupport.mapSaveErrors { doc.protect(policy) }
        PdfBoxSupport.saveTo(doc, target)
      }
    }

    private const val AES_KEY_BITS = 256

    private fun allowsChanges(doc: PDDocument): Boolean {
      val access = doc.currentAccessPermission
      return access.isOwnerPermission ||
        (access.canModify() && access.canAssembleDocument() && access.canExtractContent())
    }
  }
}
