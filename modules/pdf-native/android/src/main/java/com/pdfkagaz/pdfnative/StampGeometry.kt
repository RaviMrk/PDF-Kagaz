package com.pdfkagaz.pdfnative

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** A page's CropBox in user space plus its `/Rotate` (clockwise display rotation: 0/90/180/270). */
data class PageBox(val x: Double, val y: Double, val width: Double, val height: Double, val rotation: Int)

data class StampSize(val width: Double, val height: Double)

/** A point of the page as seen: points from the top-left corner, y down. */
data class StampCenter(val cx: Double, val cy: Double)

/** Origin of the unrotated box in user space and its rotation (degrees counter-clockwise, 0..360). */
data class Placement(val x: Double, val y: Double, val width: Double, val height: Double, val rotate: Double)

/**
 * The twin of src/services/pdf/stampGeometry.ts (same names, same math, same vectors in
 * `__fixtures__/stamp-vectors.json`), so a stamp lands in the same place on both routes.
 */
object StampGeometry {
  /** `/Rotate` folded into 0/90/180/270; a value that is not a right angle counts as 0 (as PdfBox does). */
  fun normalizeRotation(raw: Int): Int = if (raw % 90 != 0) 0 else ((raw % 360) + 360) % 360

  /** The page as seen: CropBox size, swapped for a quarter turn. */
  fun visualSize(page: PageBox): StampSize =
    if (page.rotation == 90 || page.rotation == 270) StampSize(page.height, page.width) else StampSize(page.width, page.height)

  /** The axis-aligned bounds of a [w] x [h] box turned by [angleDeg]. */
  fun rotatedBounds(w: Double, h: Double, angleDeg: Double): StampSize {
    val t = Math.toRadians(angleDeg)
    val c = abs(cos(t))
    val s = abs(sin(t))
    return StampSize(w * c + h * s, w * s + h * c)
  }

  /**
   * The centre of a stamp at [position] (`top-left` … `bottom-right`, `center`) in points of the
   * page as seen; [box] is the stamp's bounds as seen ([rotatedBounds]), [marginPt] inside the edges.
   * An unknown position → ERR_INVALID_NAME.
   */
  fun positionCenter(position: String, visual: StampSize, box: StampSize, marginPt: Double): StampCenter {
    if (position !in POSITIONS) throw InvalidNameException()
    val parts = if (position == "center") listOf("middle", "center") else position.split('-')
    val cx = when (parts[1]) {
      "left" -> marginPt + box.width / 2
      "right" -> visual.width - marginPt - box.width / 2
      else -> visual.width / 2
    }
    val cy = when (parts[0]) {
      "top" -> marginPt + box.height / 2
      "bottom" -> visual.height - marginPt - box.height / 2
      else -> visual.height / 2
    }
    return StampCenter(cx, cy)
  }

  /**
   * Where to draw [box] centred at [center] (as seen) and turned [angleDeg] counter-clockwise as
   * seen: the user-space rotation is `angleDeg + rotation` (the page shows its content turned
   * clockwise by `rotation`); the origin is the user-space centre minus the rotated half-box.
   */
  fun placeOnPage(page: PageBox, center: StampCenter, box: StampSize, angleDeg: Double): Placement {
    val (x0, y0, w, h, rotation) = page
    val (vx, vy) = center
    val (ux, uy) = when (rotation) {
      90 -> (x0 + vy) to (y0 + vx)
      180 -> (x0 + w - vx) to (y0 + vy)
      270 -> (x0 + w - vy) to (y0 + h - vx)
      else -> (x0 + vx) to (y0 + h - vy)
    }
    val rotate = ((angleDeg + rotation) % 360 + 360) % 360
    val t = Math.toRadians(rotate)
    val hw = box.width / 2
    val hh = box.height / 2
    return Placement(
      x = ux - (hw * cos(t) - hh * sin(t)),
      y = uy - (hw * sin(t) + hh * cos(t)),
      width = box.width,
      height = box.height,
      rotate = rotate,
    )
  }

  val POSITIONS = setOf(
    "top-left", "top-center", "top-right",
    "middle-left", "center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
  )
}
