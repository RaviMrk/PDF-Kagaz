package com.pdfkagaz.pdfnative

/** Pure reading of an ACTION_OPEN_DOCUMENT result: the picked URIs, in order. */
object PickerResults {
  /** Most documents one pick may return; the rest are dropped. */
  const val MAX = 50

  /** The clip items when there are any (multiple selection), else [data]; blanks dropped, distinct, first [MAX]. */
  fun urisOf(data: String?, clip: List<String>): List<String> {
    val picked = if (clip.isNotEmpty()) clip else listOfNotNull(data)
    return picked.filter { it.isNotBlank() }.distinct().take(MAX)
  }
}
