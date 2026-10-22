package com.pdfkagaz.pdfnative

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PartClaimTest {
  @get:Rule
  val tmp = TemporaryFolder()

  private fun unique(name: String) = { taken: (String) -> Boolean -> ToolPaths.uniqueTarget(name, taken) }

  @Test
  fun skipsExistingTargetsAndInFlightParts() {
    val dir = tmp.newFolder()
    File(dir, "a.pdf").writeText("original")
    File(dir, ".a (2).pdf.part").writeText("someone else's part")
    val claim = PartClaim.claim(dir, unique("a.pdf"))
    assertEquals("a (3).pdf", claim.name)
    assertEquals(".a (3).pdf.part", claim.part.name)
    assertTrue(claim.part.isFile)
    assertEquals("someone else's part", File(dir, ".a (2).pdf.part").readText())
  }

  @Test
  fun duplicateNamesAlsoSkipInFlightParts() {
    val dir = tmp.newFolder()
    File(dir, ".a (copy).pdf.part").writeText("in flight")
    val claim = PartClaim.claim(dir) { taken -> FileNames.duplicateName("a.pdf", taken) }
    assertEquals("a (copy 2).pdf", claim.name)
  }

  @Test
  fun commitNeverReplacesATargetThatAppearedMeanwhile() {
    val dir = tmp.newFolder()
    val claim = PartClaim.claim(dir, unique("a.pdf"))
    claim.part.writeText("new")
    File(dir, "a.pdf").writeText("user's file")
    val target = claim.commit()
    assertEquals("a (2).pdf", target?.name)
    assertEquals("new", target?.readText())
    assertEquals("user's file", File(dir, "a.pdf").readText())
    assertFalse(claim.part.exists())
  }

  @Test
  fun releaseDeletesOnlyTheClaimedPart() {
    val dir = tmp.newFolder()
    val claim = PartClaim.claim(dir, unique("a.pdf"))
    claim.release()
    assertFalse(claim.part.exists())
    assertEquals(0, dir.listFiles()!!.size)
  }

  @Test
  fun isTakenCountsExistingNamesAndInFlightParts() {
    val dir = tmp.newFolder()
    File(dir, "a.pdf").writeText("x")
    File(dir, ".b.pdf.part").writeText("being published")
    assertTrue(PartClaim.isTaken(dir, "a.pdf"))
    assertTrue(PartClaim.isTaken(dir, "b.pdf"))
    assertFalse(PartClaim.isTaken(dir, "c.pdf"))
  }

  @Test
  fun aClaimedNameIsTakenUntilReleased() {
    val dir = tmp.newFolder()
    val claim = PartClaim.claim(dir, unique("a.pdf"))
    assertTrue(PartClaim.isTaken(dir, "a.pdf"))
    claim.release()
    assertFalse(PartClaim.isTaken(dir, "a.pdf"))
  }
}
