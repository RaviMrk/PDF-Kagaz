package com.pdfkagaz.pdfnative

import kotlin.math.roundToInt

/** The three Compress levels (JS passes the key) and the image sizing they use. */
object CompressLevels {
  data class Level(val maxLongSidePx: Int, val jpegQuality: Int, val dropThumbnails: Boolean)

  private val LEVELS = mapOf(
    "low" to Level(2400, 80, false),
    "medium" to Level(1600, 65, true),
    "high" to Level(1024, 50, true),
  )

  /** The level named [key]; anything else → ERR_INVALID_NAME. */
  fun of(key: String): Level = LEVELS[key] ?: throw InvalidNameException()

  /** [w]×[h] scaled so its long side is at most [maxLongSide], keeping the aspect; never upscaled. */
  fun targetSize(w: Int, h: Int, maxLongSide: Int): Pair<Int, Int> {
    val long = maxOf(w, h)
    if (long <= maxLongSide) return w to h
    val scale = maxLongSide.toDouble() / long
    return maxOf(1, (w * scale).roundToInt()) to maxOf(1, (h * scale).roundToInt())
  }

  /** The largest power of 2 that still decodes the long side to at least [targetLongSide] pixels. */
  fun subsamplingFor(w: Int, h: Int, targetLongSide: Int): Int {
    val long = maxOf(w, h)
    var s = 1
    while (long / (s * 2) >= targetLongSide) s *= 2
    return s
  }
}
