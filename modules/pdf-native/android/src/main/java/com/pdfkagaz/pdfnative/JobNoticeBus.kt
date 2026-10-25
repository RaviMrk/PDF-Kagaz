package com.pdfkagaz.pdfnative

import java.util.concurrent.CopyOnWriteArraySet

/**
 * Hands "Cancel" presses from the job notification (ToolJobService) to the module, which tells JS
 * (`onJobCancelRequested`): JS-route jobs stop through their AbortSignal, not through NativeJobs.
 */
object JobNoticeBus {
  private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

  fun addListener(listener: (String) -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: (String) -> Unit) {
    listeners.remove(listener)
  }

  fun cancelRequested(jobId: String) {
    for (listener in listeners) {
      try {
        listener(jobId)
      } catch (e: Exception) {
        // A listener of a destroyed module instance; the others still hear the cancel.
      }
    }
  }
}
