package com.pdfkagaz.pdfnative

/** Pure reading of a document or photo picker result: the picked URIs, in order. */
object PickerResults {
  /** Most documents one pick may return; the rest are dropped. */
  const val MAX = 50

  /** The clip items when there are any (multiple selection), else [data]; blanks dropped, distinct, first [MAX]. */
  fun urisOf(data: String?, clip: List<String>): List<String> = urisOf(data, clip, MAX)

  /** As [urisOf] with at most [max] uris (the image picker allows more than [MAX]). */
  fun urisOf(data: String?, clip: List<String>, max: Int): List<String> = limited(data, clip, max).uris

  /** The first [max] picks and how many more (distinct, non-blank) were [dropped]. */
  data class Limited(val uris: List<String>, val dropped: Int)

  /**
   * As [urisOf], also counting the picks over [max]: the ACTION_OPEN_DOCUMENT fallback of the photo
   * picker has no item limit, so the caller must be able to tell the user some were not added.
   */
  fun limited(data: String?, clip: List<String>, max: Int): Limited {
    val picked = (if (clip.isNotEmpty()) clip else listOfNotNull(data)).filter { it.isNotBlank() }.distinct()
    val kept = picked.take(max.coerceAtLeast(0))
    return Limited(kept, picked.size - kept.size)
  }
}
