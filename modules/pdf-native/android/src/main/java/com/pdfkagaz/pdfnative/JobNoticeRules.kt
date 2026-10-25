package com.pdfkagaz.pdfnative

/** Pure rules of the tool job progress notification (ToolJobService). */
object JobNoticeRules {
  /** A notification update needs a new percent and this long since the last one (100 % always shows). */
  const val UPDATE_INTERVAL_MS = 500L

  /** 0..1 → 0..100, rounded; NaN → 0, out-of-range values clamped. */
  fun percentOf(fraction: Double): Int {
    if (fraction.isNaN()) return 0
    return Math.round(fraction.coerceIn(0.0, 1.0) * 100).toInt()
  }

  /** The first update always shows; later ones when the percent changed after 500 ms, or at 100 %. */
  fun shouldUpdate(lastAtMs: Long?, nowMs: Long, lastPercent: Int, percent: Int): Boolean {
    if (lastAtMs == null || percent == 100) return true
    return percent != lastPercent && nowMs - lastAtMs >= UPDATE_INTERVAL_MS
  }

  /** Where tapping a job notification goes: the job's result, or Home for an id that is not a job id. */
  fun resultDeepLink(jobId: String): String =
    if (ToolPaths.isValidJobId(jobId)) "pdftoolkit://result?jobId=$jobId" else "pdftoolkit://home"
}
