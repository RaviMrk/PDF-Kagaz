package com.pdfkagaz.pdfnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolPathsTest {
  private val root = "/data/user/0/p/cache/tools"

  @Test
  fun jobIdsAreShortLowercaseSlugs() {
    assertTrue(ToolPaths.isValidJobId("lq3x9-ab12cd"))
    assertTrue(ToolPaths.isValidJobId("a".repeat(64)))
    assertFalse(ToolPaths.isValidJobId("../x"))
    assertFalse(ToolPaths.isValidJobId(""))
    assertFalse(ToolPaths.isValidJobId("A"))
    assertFalse(ToolPaths.isValidJobId("a".repeat(65)))
    assertFalse(ToolPaths.isValidJobId("a/b"))
  }

  @Test
  fun workspaceFilesAreStrictlyInsideAJobDir() {
    assertTrue(ToolPaths.isWorkspaceFile(root, "$root/j1/out-1.pdf"))
    assertFalse(ToolPaths.isWorkspaceFile(root, "$root/j1"))
    assertFalse(ToolPaths.isWorkspaceFile(root, root))
    assertFalse(ToolPaths.isWorkspaceFile(root, "/data/user/0/p/cache/reader/x.pdf"))
    assertFalse(ToolPaths.isWorkspaceFile(root, "/data/user/0/p/cache/toolsx/j1/a.pdf"))
    assertFalse(ToolPaths.isWorkspaceFile(root, "$root/a.pdf"))
    assertFalse(ToolPaths.isWorkspaceFile(root, "$root/j1/sub/a.pdf"))
    assertFalse(ToolPaths.isWorkspaceFile(root, "$root/../tools/j1/a.pdf"))
  }

  @Test
  fun partNamesAreHiddenSiblings() {
    assertEquals(".a.pdf.part", ToolPaths.partName("a.pdf"))
  }

  @Test
  fun leftoverPartsAreHiddenPdfParts() {
    assertTrue(ToolPaths.isLeftoverPart(".a merged.pdf.part"))
    assertFalse(ToolPaths.isLeftoverPart("a.pdf"))
    assertFalse(ToolPaths.isLeftoverPart(".a.pdf"))
    assertFalse(ToolPaths.isLeftoverPart("a.pdf.part"))
    assertFalse(ToolPaths.isLeftoverPart(".pdf.part"))
  }

  @Test
  fun uniqueTargetSkipsNamesWhosePartIsInFlight() {
    assertEquals("a (3).pdf", ToolPaths.uniqueTarget("a.pdf") { it in setOf("a.pdf", ".a (2).pdf.part") })
    assertEquals("a.pdf", ToolPaths.uniqueTarget("a.pdf") { false })
  }

  @Test
  fun outputNamesLoseControlCharacters() {
    assertEquals("a b.pdf", ToolPaths.cleanOutputName("a\u0000 b\u001f\u007f.pdf"))
    assertEquals("अहवाल.pdf", ToolPaths.cleanOutputName("अहवाल.pdf"))
  }

  @Test
  fun longNamesLeaveRoomForACounterAndThePartName() {
    val long = "अ".repeat(100) + ".pdf" // 304 bytes
    val fitted = ToolPaths.fitName(long)
    assertTrue(fitted.endsWith(".pdf"))
    val base = fitted.removeSuffix(".pdf")
    assertEquals("अ".repeat(base.length), base)
    val worst = ToolPaths.partName("$base (999).pdf")
    assertTrue(worst.toByteArray(Charsets.UTF_8).size <= FileNames.MAX_NAME_BYTES)
    assertTrue(FileNames.isValidName(fitted))
  }

  @Test
  fun shortNamesAreNotTouched() {
    assertEquals("a merged.pdf", ToolPaths.fitName("a merged.pdf"))
    val edge = "a".repeat(ToolPaths.MAX_BASE_BYTES) + ".pdf"
    assertEquals(edge, ToolPaths.fitName(edge))
    assertEquals("a".repeat(ToolPaths.MAX_BASE_BYTES) + ".pdf", ToolPaths.fitName("a".repeat(300) + ".pdf"))
  }

  @Test
  fun imageSessionsAreImgPrefixedJobIds() {
    assertTrue(ToolPaths.isImageSessionId("img-lq3x9-ab12cd"))
    assertFalse(ToolPaths.isImageSessionId("lq3x9-ab12cd"))
    assertFalse(ToolPaths.isImageSessionId("img-../x"))
    assertEquals("src-3", ToolPaths.sourceName(3))
    assertEquals("page-0.jpg", ToolPaths.pageName(0))
    assertTrue(ToolPaths.isWorkspaceFile(root, "$root/img-a/src-3"))
  }
}
