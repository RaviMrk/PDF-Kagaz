package com.pdfkagaz.pdfnative

/** Pure reading of a document or photo picker result: the picked URIs, in order. */
object PickerResults {
  /** Most documents one pick may return; the rest are dropped. */
  const val MAX = 50

  /** The clip items when there are any (multiple selection), else [data]; blanks dropped, distinct, first [MAX]. */
  fun urisOf(data: String?, clip: List<String>): List<String> = urisOf(data, clip, MAX)

  /** As [urisOf] with at most [max] uris (the image picker allows more than [MAX]). */
  fun urisOf(data: String?, clip: List<String>, max: Int): List<String> {
    val picked = if (clip.isNotEmpty()) clip else listOfNotNull(data)
    return picked.filter { it.isNotBlank() }.distinct().take(max.coerceAtLeast(0))
  }
}
