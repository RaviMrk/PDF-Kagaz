package com.pdfkagaz.pdfnative

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VolumesTest {
  private val primary = Volume(File("/storage/emulated/0"), null)
  private val sd = Volume(File("/storage/1234-ABCD"), "SD card")

  @Test
  fun fileOnAnUnmountedVolumeIsUnavailable() {
    // SD card removed: only the primary volume is mounted.
    assertTrue(Volumes.isOnUnavailableVolume(File("/storage/1234-ABCD/Docs/a.pdf"), listOf(primary)))
    assertTrue(Volumes.isOnUnavailableVolume(File("/mnt/media_rw/1234-ABCD/a.pdf"), listOf(primary)))
  }

  @Test
  fun fileOnAMountedVolumeOrInAppStorageIsNotUnavailable() {
    assertFalse(Volumes.isOnUnavailableVolume(File("/storage/emulated/0/Download/a.pdf"), listOf(primary)))
    assertFalse(Volumes.isOnUnavailableVolume(File("/storage/1234-ABCD/a.pdf"), listOf(primary, sd)))
    // App-private storage is never on a removable volume: a missing file there is simply gone.
    assertFalse(Volumes.isOnUnavailableVolume(File("/data/user/0/com.pdfkagaz/files/a.pdf"), listOf(primary)))
  }

  @Test
  fun missingFileErrorIsVolumeUnavailableOnlyForUnmountedVolumes() {
    assertEquals("ERR_VOLUME_UNAVAILABLE", Volumes.missingFileError(File("/storage/1234-ABCD/a.pdf"), listOf(primary)).code)
    assertEquals("ERR_FILE_NOT_FOUND", Volumes.missingFileError(File("/storage/emulated/0/a.pdf"), listOf(primary)).code)
  }

  @Test
  fun volumeUnavailableMessageCarriesNoPath() {
    val error = Volumes.missingFileError(File("/storage/1234-ABCD/secret-name.pdf"), listOf(primary))
    assertFalse(error.message.orEmpty().contains("secret"))
    assertFalse(error.message.orEmpty().contains("1234"))
  }
}
