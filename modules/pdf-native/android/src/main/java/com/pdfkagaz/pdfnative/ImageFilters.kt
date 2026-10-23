package com.pdfkagaz.pdfnative

/** Pure document filters as 4x5 colour matrices (row-major, offsets in 0..255). */
object ImageFilters {
  const val COLOUR = "colour"
  const val GREYSCALE = "greyscale"
  const val BW = "bw"

  private const val KNEE = 24f

  fun isValid(filter: String): Boolean = filter == COLOUR || filter == GREYSCALE || filter == BW

  /** null for colour (no filter) and for unknown names. */
  fun matrix(filter: String): FloatArray? = when (filter) {
    GREYSCALE -> floatArrayOf(
      0.299f, 0.587f, 0.114f, 0f, 0f,
      0.299f, 0.587f, 0.114f, 0f, 0f,
      0.299f, 0.587f, 0.114f, 0f, 0f,
      0f, 0f, 0f, 1f, 0f,
    )
    BW -> {
      val r = 0.299f * KNEE
      val g = 0.587f * KNEE
      val b = 0.114f * KNEE
      val t = 128f - 128f * KNEE
      floatArrayOf(
        r, g, b, 0f, t,
        r, g, b, 0f, t,
        r, g, b, 0f, t,
        0f, 0f, 0f, 1f, 0f,
      )
    }
    else -> null
  }

  /** What [matrix] does to an opaque pixel, clamped to 0..255. */
  fun applyTo(matrix: FloatArray, r: Int, g: Int, b: Int): Triple<Int, Int, Int> {
    fun row(i: Int) = Math.round(matrix[i * 5] * r + matrix[i * 5 + 1] * g + matrix[i * 5 + 2] * b + matrix[i * 5 + 3] * 255f + matrix[i * 5 + 4]).coerceIn(0, 255)
    return Triple(row(0), row(1), row(2))
  }
}
