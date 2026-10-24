package com.pdfkagaz.pdfnative

import android.net.Uri
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FileOpsDurabilityTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private val events = ArrayList<String>()

  @After
  fun tearDown() {
    DurableWrites.sync = DurableWrites.DEFAULT_SYNC
  }

  private fun ops() = FileOps(RuntimeEnvironment.getApplication()) { true }

  @Test
  fun duplicateSyncsTheCopyBeforeItAppearsUnderItsName() {
    val source = File(tmp.root, "report.pdf").apply { writeBytes(ByteArray(5000) { 1 }) }
    DurableWrites.sync = { fd ->
      fd.sync()
      val visible = tmp.root.listFiles()!!.filter { it.name != "report.pdf" && !it.name.startsWith(".") }
      events += "sync visible=${visible.map { it.name }}"
    }
    val info = ops().duplicate(Uri.fromFile(source).toString(), "")
    assertEquals(listOf("sync visible=[]"), events)
    assertEquals(5000L, File(Uri.parse(info["uri"] as String).path!!).length())
  }

  @Test
  fun aMoveByCopyDeletesTheSourceOnlyAfterTheCopyIsSynced() {
    val source = File(tmp.root, "only-copy.pdf").apply { writeBytes(ByteArray(4096) { 2 }) }
    val dir = tmp.newFolder("PDFToolkit")
    DurableWrites.sync = { fd ->
      fd.sync()
      events += "sync"
    }
    val moved = ops().moveByCopy(Uri.fromFile(source), dir, "only-copy.pdf") {
      events += "delete source"
      assertTrue(source.delete())
    }
    assertEquals(listOf("sync", "delete source"), events)
    assertEquals(4096L, moved.length())
  }

  @Test
  fun aFailedSyncKeepsTheSourceAndLeavesNoCopy() {
    val source = File(tmp.root, "keep.pdf").apply { writeBytes(ByteArray(10)) }
    val dir = tmp.newFolder("PDFToolkit")
    DurableWrites.sync = { throw java.io.SyncFailedException("disk") }
    try {
      ops().moveByCopy(Uri.fromFile(source), dir, "keep.pdf") { events += "delete source" }
    } catch (_: Exception) {
      // Expected: the move fails.
    }
    assertEquals(emptyList<String>(), events)
    assertTrue(source.isFile)
    assertEquals(emptyList<String>(), dir.list()!!.toList())
  }
}
