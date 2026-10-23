package com.pdfkagaz.pdfnative

/** Image pipeline limits; IMAGES_MAX and IMAGE_MAX_BYTES mirror src/services/tools/limits.ts. */
object ImageLimits {
  const val IMAGES_MAX = 100
  const val IMAGE_MAX_BYTES = 52_428_800L
  const val THUMB_MAX_WIDTH = 512
}
