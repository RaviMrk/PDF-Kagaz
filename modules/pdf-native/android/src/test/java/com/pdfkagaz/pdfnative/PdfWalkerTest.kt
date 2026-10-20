package com.pdfkagaz.pdfnative

import java.io.File
import java.nio.file.Files
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PdfWalkerTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private fun touch(root: File, rel: String): File {
    val f = File(root, rel)
    f.parentFile!!.mkdirs()
    f.writeText("%PDF-1.4")
    return f
  }

  private fun buildTree(): File {
    val root = tmp.root
    touch(root, "Download/a.pdf")
    touch(root, "Download/अहवाल.pdf")
    touch(root, "Download/b c#1%.PDF")
    touch(root, "Download/notes.txt")
    touch(root, "Download/.hidden/x.pdf")
    touch(root, ".trash/y.pdf")
    touch(root, "Android/data/com.app/z.pdf")
    touch(root, "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/w.pdf")
    touch(root, "Documents/Deep/Deeper/d.pdf")
    Files.createSymbolicLink(File(root, "Documents/loop").toPath(), root.toPath())
    return root
  }

  @Test
  fun walkFindsVisiblePdfsAndSkipsLoops() {
    val root = buildTree()
    val found = PdfWalker().walk(root)
    assertEquals(
      setOf("a.pdf", "अहवाल.pdf", "b c#1%.PDF", "w.pdf", "d.pdf"),
      found.map { it.file.name }.toSet(),
    )
    assertEquals(5, found.size)
    assertEquals("Documents/Deep/Deeper", found.single { it.file.name == "d.pdf" }.relDir)
  }

  @Test
  fun walkReportsFinalProgress() {
    val root = buildTree()
    var lastFound = -1
    var lastFolders = -1
    PdfWalker(
      onProgress = { folders, found ->
        lastFolders = folders
        lastFound = found
      },
    ).walk(root)
    assertEquals(5, lastFound)
    assertTrue(lastFolders > 0)
  }

  @Test
  fun listDirIsNonRecursive() {
    val root = buildTree()
    val found = PdfWalker().listDir(File(root, "Download"))!!
    assertEquals(setOf("a.pdf", "अहवाल.pdf", "b c#1%.PDF"), found.map { it.file.name }.toSet())
  }

  @Test
  fun walksThousandPdfsQuickly() {
    val root = tmp.root
    for (folder in 0 until 50) {
      for (i in 0 until 20) touch(root, "f$folder/sub/file$i.pdf")
    }
    val start = System.nanoTime()
    val found = PdfWalker().walk(root)
    val ms = (System.nanoTime() - start) / 1_000_000
    assertEquals(1000, found.size)
    assertTrue("walk took $ms ms", ms < 2000)
  }

  @Test
  fun missingRootReturnsEmpty() {
    assertEquals(emptyList<FoundPdf>(), PdfWalker().walk(File(tmp.root, "nope")))
  }

  @Test
  fun doesNotFollowSymlinkedDirsOrFiles() {
    val root = tmp.newFolder("scan")
    val outside = tmp.newFolder("outside")
    touch(outside, "o.pdf")
    touch(root, "Download/real.pdf")
    Files.createSymbolicLink(File(root, "Download/linkdir").toPath(), outside.toPath())
    Files.createSymbolicLink(File(root, "Download/link.pdf").toPath(), File(outside, "o.pdf").toPath())
    assertEquals(listOf("real.pdf"), PdfWalker().walk(root).map { it.file.name })
    assertEquals(listOf("real.pdf"), PdfWalker().listDir(File(root, "Download"))!!.map { it.file.name })
  }

  @Test
  fun listDirSignalsUnreadableWithNull() {
    val notADir = touch(tmp.root, "file.pdf")
    assertNull(PdfWalker().listDir(notADir))
    assertNull(PdfWalker().listDir(File(tmp.root, "missing")))
  }

  @Test
  fun walkReportsUnlistableSubdirsAndKeepsScanningTheRest() {
    val root = tmp.newFolder("scan2")
    touch(root, "Good/ok.pdf")
    touch(root, "Bad/lost.pdf")
    val bad = File(root, "Bad").canonicalFile
    val walker = PdfWalker(lister = { dir -> if (dir.canonicalFile == bad) null else dir.listFiles() })
    val found = walker.walk(root)
    assertEquals(listOf("ok.pdf"), found.map { it.file.name })
    assertEquals(listOf(bad), walker.failedDirs.map { it.canonicalFile })
  }

  @Test
  fun skippedDirsAndSymlinksAreNotReportedAsFailed() {
    val root = buildTree()
    val walker = PdfWalker()
    walker.walk(root)
    assertEquals(emptyList<File>(), walker.failedDirs)
  }

  @Test
  fun parallelWalkListsSiblingFoldersConcurrently() {
    val root = tmp.newFolder("par")
    touch(root, "A/a.pdf")
    touch(root, "B/b.pdf")
    // Both siblings must be inside lister() at the same time, or await() times out.
    val barrier = CyclicBarrier(2)
    val walker = PdfWalker(
      lister = { dir ->
        if (dir.name == "A" || dir.name == "B") barrier.await(5, TimeUnit.SECONDS)
        dir.listFiles()
      },
      parallelism = 4,
    )
    assertEquals(setOf("a.pdf", "b.pdf"), walker.walk(root).map { it.file.name }.toSet())
  }

  @Test
  fun parallelWalkMatchesSequentialWalk() {
    val root = buildTree()
    for (folder in 0 until 30) {
      for (i in 0 until 5) touch(root, "bulk/f$folder/sub/file$i.pdf")
    }
    val sequential = PdfWalker().walk(root)
    var lastFound = -1
    var lastFolders = -1
    val parallelWalker = PdfWalker(
      onProgress = { folders, found ->
        lastFolders = folders
        lastFound = found
      },
      parallelism = 4,
    )
    val parallel = parallelWalker.walk(root)
    assertEquals(sequential.map { it.file.path to it.relDir }.toSet(), parallel.map { it.file.path to it.relDir }.toSet())
    assertEquals(sequential.size, parallel.size)
    assertEquals(parallel.size, lastFound)
    assertTrue(lastFolders > 60)
    assertEquals(emptyList<File>(), parallelWalker.failedDirs)
  }

  @Test
  fun parallelWalkReportsUnlistableSubdirs() {
    val root = tmp.newFolder("par2")
    touch(root, "Good/ok.pdf")
    touch(root, "Bad/lost.pdf")
    val bad = File(root, "Bad").canonicalFile
    val walker = PdfWalker(lister = { dir -> if (dir.canonicalFile == bad) null else dir.listFiles() }, parallelism = 3)
    assertEquals(listOf("ok.pdf"), walker.walk(root).map { it.file.name })
    assertEquals(listOf(bad), walker.failedDirs.map { it.canonicalFile })
  }

  @Test(expected = IllegalStateException::class)
  fun parallelWalkPropagatesListerFailures() {
    val root = tmp.newFolder("par3")
    touch(root, "X/x.pdf")
    PdfWalker(lister = { dir -> if (dir.name == "X") throw IllegalStateException("boom") else dir.listFiles() }, parallelism = 2)
      .walk(root)
  }
}
