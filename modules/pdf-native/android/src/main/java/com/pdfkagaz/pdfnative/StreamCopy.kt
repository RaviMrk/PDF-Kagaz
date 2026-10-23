package com.pdfkagaz.pdfnative

import android.content.Context
import android.net.Uri
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ensureActive

/** Guarded, capped, cancellable copying shared by tool inputs ([ToolFiles]) and image sources ([ImageFiles]). */
object StreamCopy {
  private const val BUFFER_BYTES = 256 * 1024

  /** file:// opened then verified, content:// own providers refused ([UriGuard]); read-only. */
  fun openGuarded(context: Context, uri: Uri): InputStream =
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
  fun copyChunks(scope: CoroutineScope, input: InputStream, output: OutputStream, cap: Long): Long {
    val buffer = ByteArray(BUFFER_BYTES)
    var copied = 0L
    while (true) {
      scope.ensureActive()
      val read = input.read(buffer)
      if (read < 0) return copied
      copied += read
      if (ToolLimits.exceedsCopied(copied, cap)) throw TooLargeException()
      output.write(buffer, 0, read)
    }
  }
}
