package com.pdfkagaz.pdfnative

/** Pure size maths for bounded decoding and scaling. */
object ImageSizing {
  /** Largest power of two s with max(width, height) / s >= [maxLongSide]; 1 when already at or below it. */
  fun sampleSize(width: Int, height: Int, maxLongSide: Int): Int {
    val long = maxOf(width, height)
    var sample = 1
    while (long / (sample * 2) >= maxLongSide) sample *= 2
    return sample
  }

  /** Long side limited to [maxLongSide], aspect kept, each side at least 1, never upscaled. */
  fun targetSize(width: Int, height: Int, maxLongSide: Int): Pair<Int, Int> {
    val long = maxOf(width, height)
    if (long <= maxLongSide) return width.coerceAtLeast(1) to height.coerceAtLeast(1)
    val w = Math.round(width.toDouble() * maxLongSide / long).toInt().coerceAtLeast(1)
    val h = Math.round(height.toDouble() * maxLongSide / long).toInt().coerceAtLeast(1)
    return w to h
  }
}
