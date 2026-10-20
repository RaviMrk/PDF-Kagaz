package com.pdfkagaz.pdfnative

import java.security.MessageDigest

/** Cache key for a rendered thumbnail: SHA-1 (40 lowercase hex chars) of every input that changes the image. */
object ThumbKey {
  fun of(uri: String, sizeBytes: Long, modifiedAt: Long, page: Int, width: Int): String {
    val digest = MessageDigest.getInstance("SHA-1")
      .digest("$uri\n$sizeBytes\n$modifiedAt\n$page\n$width".toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }
}
