package com.pdfkagaz.pdfnative

import android.os.ParcelFileDescriptor
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.OutputStream
import java.io.SyncFailedException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DurableWritesTest {
  @get:Rule
  val tmp = TemporaryFolder()

  /** What each sync saw: the bytes on disk at that moment (the descriptor still open). */
  private val synced = ArrayList<Long>()
  private var watched: File? = null

  @Before
  fun setUp() {
    DurableWrites.sync = { fd ->
      assertTrue("synced after close", fd.valid())
      fd.sync()
      synced += watched?.length() ?: -1L
    }
  }

  @After
  fun tearDown() {
    DurableWrites.sync = DurableWrites.DEFAULT_SYNC
  }

  @Test
  fun writeFileSyncsAllBytesBeforeClosingEvenWhenTheWriterCloses() {
    val file = File(tmp.root, "out.bin").also { watched = it }
    DurableWrites.writeFile(file) { out ->
      out.write(ByteArray(300_000) { 7 })
      // PdfBox's COSWriter closes the stream it was given.
      out.close()
    }
    assertEquals(listOf(300_000L), synced)
    assertEquals(300_000L, file.length())
  }

  @Test
  fun writeFdSyncsBeforeClose() {
    val file = File(tmp.root, "fd.bin").also { watched = it }
    val pfd = ParcelFileDescriptor.open(
      file,
      ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE,
    )
    DurableWrites.writeFd(pfd, requireSync = true) { it.write(ByteArray(1234)) }
    assertEquals(listOf(1234L), synced)
  }

  @Test
  fun anUnsyncableProviderDescriptorIsBestEffortOnlyWhenAllowed() {
    DurableWrites.sync = { throw SyncFailedException("pipe") }
    val open = {
      ParcelFileDescriptor.open(
        File(tmp.root, "p.bin"),
        ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE,
      )
    }
    DurableWrites.writeFd(open(), requireSync = false) { it.write(1) }
    try {
      DurableWrites.writeFd(open(), requireSync = true) { it.write(1) }
      fail("Expected a sync failure")
    } catch (_: SyncFailedException) {
      // Required: the write fails rather than publishing unsynced bytes.
    }
  }

  /** A document provider fake: which opens were tried, and what each stream received. */
  private class FakeTarget(
    private val descriptor: (() -> ParcelFileDescriptor?)?,
    private val refusedStreamModes: Set<String> = emptySet(),
  ) : DurableWrites.WriteTarget {
    val opened = ArrayList<String>()
    val received = HashMap<String, ByteArrayOutputStream>()

    override fun openDescriptor(mode: String): ParcelFileDescriptor? {
      opened += "fd:$mode"
      val open = descriptor ?: throw FileNotFoundException("stream-only provider")
      return open()
    }

    override fun openStream(mode: String): OutputStream? {
      opened += "stream:$mode"
      if (mode in refusedStreamModes) throw IllegalArgumentException("mode")
      return ByteArrayOutputStream().also { received[mode] = it }
    }
  }

  @Test
  fun aStreamOnlyProviderGetsTheBytesThroughTheFallbackStreamWithoutASync() {
    val target = FakeTarget(descriptor = null)
    val written = DurableWrites.writeDocument(target) { out ->
      out.write(ByteArray(70_000) { 3 })
      out.close()
      70_000
    }
    assertEquals(70_000, written)
    assertEquals(listOf("fd:w", "stream:wt"), target.opened)
    assertEquals(70_000, target.received.getValue("wt").size())
    assertEquals(emptyList<Long>(), synced)
  }

  @Test
  fun theFallbackTriesWWhenWtIsRefused() {
    val target = FakeTarget(descriptor = { null }, refusedStreamModes = setOf("wt"))
    DurableWrites.writeDocument(target) { it.write(byteArrayOf(1, 2)) }
    assertEquals(listOf("fd:w", "stream:wt", "stream:w"), target.opened)
    assertEquals(2, target.received.getValue("w").size())
  }

  @Test
  fun aProviderDescriptorIsWrittenAndSynced() {
    val file = File(tmp.root, "doc.bin").also { watched = it }
    val target = FakeTarget(descriptor = {
      ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE)
    })
    DurableWrites.writeDocument(target) { it.write(ByteArray(10)) }
    assertEquals(listOf("fd:w"), target.opened)
    assertEquals(listOf(10L), synced)
  }

  @Test
  fun saveToSyncsThePartFileBeforeTheRename() {
    PdfBoxSupport.init(RuntimeEnvironment.getApplication())
    val target = File(tmp.root, "saved.pdf")
    val part = File(tmp.root, "saved.pdf.part").also { watched = it }
    var targetExistedAtSync = true
    DurableWrites.sync = { fd ->
      fd.sync()
      synced += part.length()
      targetExistedAtSync = target.exists()
    }
    PdfBoxSupport.open(Fixtures.file("mixed-sizes.pdf"), null, tmp.newFolder("pdfbox")).use { doc ->
      PdfBoxSupport.saveTo(doc, target)
    }
    assertEquals(1, synced.size)
    assertEquals(target.length(), synced[0])
    assertFalse(targetExistedAtSync)
    assertFalse(part.exists())
  }
}
