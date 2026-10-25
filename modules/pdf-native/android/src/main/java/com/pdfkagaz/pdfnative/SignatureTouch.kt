package com.pdfkagaz.pdfnative

/**
 * Which pointer draws (pure; the view feeds it MotionEvent data). Only the finger that went down
 * first draws: other fingers are ignored, and when the drawing finger lifts while another stays
 * down the stroke ends, and nothing more is drawn until the next ACTION_DOWN.
 */
class SignatureTouch(private val strokes: SignatureStrokes) {
  enum class Result { STARTED, ENDED, IGNORED }

  private var activeId = NONE

  val isTracking: Boolean
    get() = activeId != NONE

  /** ACTION_DOWN of pointer [pointerId]. */
  fun down(pointerId: Int, x: Float, y: Float): Result {
    activeId = pointerId
    strokes.start(x, y)
    return Result.STARTED
  }

  /** ACTION_POINTER_DOWN: a second finger never draws. */
  fun pointerDown(): Result = Result.IGNORED

  /** The index of the drawing pointer in an event ([findPointerIndex]), or -1 when none draws. */
  fun activeIndex(findPointerIndex: (Int) -> Int): Int = if (activeId == NONE) -1 else findPointerIndex(activeId)

  /** A point of the drawing pointer; false when dropped or nothing is being drawn. */
  fun move(x: Float, y: Float): Boolean = isTracking && strokes.move(x, y)

  /** ACTION_POINTER_UP of [pointerId]: ends the stroke only when it is the drawing pointer. */
  fun pointerUp(pointerId: Int): Result = if (pointerId == activeId) end() else Result.IGNORED

  /** ACTION_UP. */
  fun up(): Result = end()

  /** ACTION_CANCEL: the partial stroke is kept, like a lift. */
  fun cancel(): Result = end()

  private fun end(): Result {
    if (activeId == NONE) return Result.IGNORED
    activeId = NONE
    strokes.end()
    return Result.ENDED
  }

  private companion object {
    const val NONE = -1
  }
}
