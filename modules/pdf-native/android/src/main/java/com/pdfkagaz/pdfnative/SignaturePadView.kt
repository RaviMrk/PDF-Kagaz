package com.pdfkagaz.pdfnative

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A finger signature pad: strokes are smoothed into quadratic paths and drawn into an offscreen
 * bitmap; [export] redraws them, trimmed and transparent, into a PNG of at most 1200 px width.
 * The background is whatever the JS style gives the view; it is never exported.
 */
@SuppressLint("ViewConstructor")
class SignaturePadView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPadChange by EventDispatcher()

  private val strokes = SignatureStrokes()
  private val touch = SignatureTouch(strokes)
  private var inkColor = DEFAULT_INK
  private var strokeWidthDp = DEFAULT_STROKE_DP
  private var offscreen: Bitmap? = null
  /** A finger is down: the last stroke is drawn live in [onDraw], not yet into [offscreen]. */
  private var drawing = false
  private val path = Path()
  private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }

  init {
    setWillNotDraw(false)
    applyPaint()
  }

  fun setInkColor(value: String) {
    inkColor = try {
      Color.parseColor(value)
    } catch (_: IllegalArgumentException) {
      DEFAULT_INK
    }
    applyPaint()
    redraw()
  }

  fun setStrokeWidthDp(value: Double) {
    strokeWidthDp = if (value.isFinite() && value > 0) value.toFloat() else DEFAULT_STROKE_DP
    applyPaint()
    redraw()
  }

  fun clear() {
    val wasEmpty = strokes.isEmpty
    touch.cancel()
    strokes.clear()
    drawing = false
    redraw()
    if (!wasEmpty) onPadChange(mapOf("empty" to true))
  }

  /**
   * Writes the drawing to filesDir/signatures/sig-<epochMs>-<rand6>.png; null when nothing is
   * drawn. The bitmap is drawn on the calling (main) thread, the PNG is written on IO.
   */
  suspend fun export(filesDir: File): Map<String, Any>? {
    return withContext(Dispatchers.Main) { exportOnMain(filesDir) }
  }

  private suspend fun exportOnMain(filesDir: File): Map<String, Any>? {
    if (strokes.isEmpty) return null
    val crop = strokes.cropFor(SignatureStrokes.MAX_WIDTH_PX, SignatureStrokes.PADDING_PX)
    val bitmap = try {
      Bitmap.createBitmap(crop.width, crop.height, Bitmap.Config.ARGB_8888)
    } catch (e: OutOfMemoryError) {
      throw TooLargeException()
    }
    try {
      Canvas(bitmap).apply {
        scale(crop.scale, crop.scale)
        translate(-crop.left, -crop.top)
        drawStrokes(this, strokes.strokes)
      }
      val file = withContext(Dispatchers.IO) {
        SignatureFiles.writePng(filesDir, bitmap, System.currentTimeMillis(), SignatureFiles.randomSuffix())
      }
      return mapOf("uri" to Uri.fromFile(file).toString(), "width" to crop.width, "height" to crop.height)
    } finally {
      bitmap.recycle()
    }
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    offscreen?.recycle()
    offscreen = if (w > 0 && h > 0) {
      try {
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      } catch (_: OutOfMemoryError) {
        null
      }
    } else {
      null
    }
    redraw()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    offscreen?.recycle()
    offscreen = null
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (offscreen == null && width > 0 && height > 0) onSizeChanged(width, height, width, height)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val bitmap = offscreen
    if (bitmap == null) {
      drawStrokes(canvas, strokes.strokes)
      return
    }
    canvas.drawBitmap(bitmap, 0f, 0f, bitmapPaint)
    if (drawing) strokes.strokes.lastOrNull()?.let { drawStroke(canvas, it) }
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // Keep the enclosing ScrollView from taking a vertical stroke as a scroll.
        parent?.requestDisallowInterceptTouchEvent(true)
        val wasEmpty = strokes.isEmpty
        touch.down(event.getPointerId(0), event.x, event.y)
        drawing = true
        invalidate()
        if (wasEmpty) onPadChange(mapOf("empty" to false))
      }
      MotionEvent.ACTION_POINTER_DOWN -> touch.pointerDown()
      MotionEvent.ACTION_MOVE -> {
        val index = touch.activeIndex(event::findPointerIndex)
        if (index < 0) return true
        var added = false
        for (h in 0 until event.historySize) {
          added = touch.move(event.getHistoricalX(index, h), event.getHistoricalY(index, h)) || added
        }
        added = touch.move(event.getX(index), event.getY(index)) || added
        if (added) invalidate()
      }
      MotionEvent.ACTION_POINTER_UP -> {
        if (touch.pointerUp(event.getPointerId(event.actionIndex)) == SignatureTouch.Result.ENDED) commitStroke()
      }
      MotionEvent.ACTION_UP -> {
        touch.up()
        commitStroke()
        parent?.requestDisallowInterceptTouchEvent(false)
      }
      // A cancel (system gesture, parent intercept) keeps the partial stroke, like a lift.
      MotionEvent.ACTION_CANCEL -> {
        touch.cancel()
        commitStroke()
        parent?.requestDisallowInterceptTouchEvent(false)
      }
      else -> return false
    }
    return true
  }

  /** Moves the stroke that just ended from the live layer into the offscreen bitmap. */
  private fun commitStroke() {
    if (!drawing) return
    drawing = false
    val last = strokes.strokes.lastOrNull()
    val bitmap = offscreen
    if (last != null && bitmap != null) drawStroke(Canvas(bitmap), last)
    invalidate()
  }

  private fun applyPaint() {
    paint.color = inkColor
    paint.strokeWidth = strokeWidthDp * resources.displayMetrics.density
    strokes.strokeWidth = paint.strokeWidth
  }

  /** Repaints the finished strokes into the offscreen bitmap (ink or size changed, or cleared). */
  private fun redraw() {
    offscreen?.let { bitmap ->
      bitmap.eraseColor(Color.TRANSPARENT)
      val all = strokes.strokes
      drawStrokes(Canvas(bitmap), if (drawing) all.dropLast(1) else all)
    }
    invalidate()
  }

  private fun drawStrokes(canvas: Canvas, list: List<List<SignatureStrokes.Point>>) {
    for (stroke in list) drawStroke(canvas, stroke)
  }

  private fun drawStroke(canvas: Canvas, stroke: List<SignatureStrokes.Point>) {
    if (stroke.size == 1) {
      paint.style = Paint.Style.FILL
      canvas.drawCircle(stroke[0].x, stroke[0].y, paint.strokeWidth / 2, paint)
      paint.style = Paint.Style.STROKE
    } else {
      canvas.drawPath(pathOf(stroke, path), paint)
    }
  }

  companion object {
    private const val DEFAULT_INK = 0xff1a1a1a.toInt()
    private const val DEFAULT_STROKE_DP = 3f

    /** Quadratic curves through the midpoints of consecutive points (control = the point). */
    internal fun pathOf(points: List<SignatureStrokes.Point>, path: Path = Path()): Path {
      path.reset()
      path.moveTo(points[0].x, points[0].y)
      if (points.size == 2) {
        path.lineTo(points[1].x, points[1].y)
        return path
      }
      for (i in 1 until points.size - 1) {
        val p = points[i]
        val next = points[i + 1]
        path.quadTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2)
      }
      path.lineTo(points.last().x, points.last().y)
      return path
    }
  }
}
