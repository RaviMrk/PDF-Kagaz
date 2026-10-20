package com.pdfkagaz.pdfnative

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ChangedFoldersTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private val toFile: (String) -> File? = { File(it) }
  private val mounted: (File) -> Boolean = { true }

  private fun dirWith(name: String, vararg pdfs: String): File {
    val dir = tmp.newFolder(name)
    pdfs.forEach { File(dir, it).writeText("%PDF") }
    return dir
  }

  @Test
  fun unchangedKnownFolderIsSkipped() {
    val dir = dirWith("Download", "a.pdf")
    val changes = ChangedFolders().check(mapOf(dir.path to dir.lastModified()), emptyList(), toFile, mounted)
    assertEquals(emptyList<DirChange>(), changes)
  }

  @Test
  fun changedKnownFolderIsListedNonRecursively() {
    val dir = dirWith("Download", "a.pdf", "b.PDF", "c.txt")
    File(dir, "sub").mkdir()
    File(dir, "sub/deep.pdf").writeText("%PDF")
    val change = ChangedFolders().check(mapOf(dir.path to 1L), emptyList(), toFile, mounted).single()
    assertTrue(change.exists)
    assertEquals(dir.lastModified(), change.modifiedAt)
    assertEquals(setOf("a.pdf", "b.PDF"), change.pdfs.map { it.file.name }.toSet())
  }

  @Test
  fun unknownHotFolderIsListedAndMissingHotFolderIgnored() {
    val hot = dirWith("Documents", "d.pdf")
    val missingHot = File(tmp.root, "WhatsApp").path
    val changes = ChangedFolders().check(emptyMap(), listOf(hot.path, missingHot), toFile, mounted)
    assertEquals(listOf(hot.path), changes.map { it.uri })
  }

  @Test
  fun knownAndHotFolderIsCheckedOnce() {
    val dir = dirWith("Download", "a.pdf")
    val changes = ChangedFolders().check(mapOf(dir.path to 1L), listOf(dir.path), toFile, mounted)
    assertEquals(1, changes.size)
  }

  @Test
  fun vanishedKnownFolderOnMountedVolumeIsReported() {
    val gone = File(tmp.root, "Gone").path
    val change = ChangedFolders().check(mapOf(gone to 5L), emptyList(), toFile, mounted).single()
    assertFalse(change.exists)
    assertEquals(emptyList<FoundPdf>(), change.pdfs)
  }

  @Test
  fun folderOnUnmountedVolumeIsSkipped() {
    val gone = File(tmp.root, "SdCardFolder").path
    val changes = ChangedFolders().check(mapOf(gone to 5L), emptyList(), toFile) { false }
    assertEquals(emptyList<DirChange>(), changes)
  }

  @Test
  fun unreadableFolderIsSkipped() {
    // A path that exists but cannot be listed (here: a file) must not be reported as an empty folder.
    val notADir = File(tmp.root, "x.pdf").apply { writeText("%PDF") }
    val changes = ChangedFolders().check(mapOf(notADir.path to 1L), emptyList(), toFile, mounted)
    assertEquals(emptyList<DirChange>(), changes)
  }

  @Test
  fun knownStampsPairsParallelArraysKeepingFileUrisOnly() {
    val known = ChangedFolders.knownStamps(
      uris = listOf("file:///s/Download/", "content://tree/x", "file:///s/Documents"),
      modifiedAts = listOf(1000.0, 2000.0, 3000.0),
    )
    assertEquals(mapOf("file:///s/Download" to 1000L, "file:///s/Documents" to 3000L), known)
  }

  @Test(expected = IllegalArgumentException::class)
  fun knownStampsRejectsMismatchedArrays() {
    ChangedFolders.knownStamps(listOf("file:///a", "file:///b"), listOf(1.0))
  }
}
