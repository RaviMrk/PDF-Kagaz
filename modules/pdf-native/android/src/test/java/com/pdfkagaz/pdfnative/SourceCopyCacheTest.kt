package com.pdfkagaz.pdfnative

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SourceCopyCacheTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private var clock = 1_000L
  private var opens = 0
  private fun cache() = SourceCopyCache(tmp.newFolder("copies"), ttlMs = 100, now = { clock })
  private val open = { opens++; ByteArrayInputStream(byteArrayOf(1, 2, 3)) }

  @Test
  fun copiesOncePerKeyWithinTheTtl() {
    val c = cache()
    val a = c.get("a", open)
    assertEquals(listOf<Byte>(1, 2, 3), a.readBytes().toList())
    clock += 50
    assertEquals(a, c.get("a", open))
    assertEquals(1, opens)
  }

  @Test
  fun anotherKeyOrAnExpiredCopyReplacesAndDeletesTheOld() {
    val c = cache()
    val a = c.get("a", open)
    clock += 1
    val b = c.get("b", open)
    assertFalse(a.exists())
    assertTrue(b.exists())
    clock += 200
    val b2 = c.get("b", open)
    assertNotEquals(b, b2)
    assertEquals(3, opens)
  }

  @Test
  fun clearDeletesTheCopy() {
    val c = cache()
    val a = c.get("a", open)
    c.clear()
    assertFalse(a.exists())
  }

  @Test
  fun aFailedCopyLeavesNothingBehind() {
    val c = cache()
    try {
      c.get("a") { throw java.io.IOException("x") }
    } catch (e: java.io.IOException) {
      // expected
    }
    assertEquals(0, tmp.root.resolve("copies").listFiles()!!.size)
  }
}
