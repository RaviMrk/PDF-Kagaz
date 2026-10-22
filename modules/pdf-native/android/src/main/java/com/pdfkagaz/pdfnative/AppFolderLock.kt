package com.pdfkagaz.pdfnative

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Process-wide lock for every write this app makes into a shared folder (tool output publish,
 * move to / duplicate in a folder, leftover cleanup), so names and part files are decided once.
 * Blocking: hold it only around non-suspending code on an IO thread.
 */
object AppFolderLock {
  private val lock = ReentrantLock()

  fun <T> withLock(block: () -> T): T = lock.withLock(block)
}
