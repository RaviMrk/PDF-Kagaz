package com.pdfkagaz.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.ExecutionException

/** The DPI a page is rendered at before recognition (sized down by [RenderSizing] when too big). */
const val OCR_DPI = 300

/**
 * Recognizes the words of [source]'s pages with the bundled (on-device) ML Kit Latin model. Not
 * thread-safe; call on Dispatchers.IO. Never logs or throws recognized text. [close] closes the
 * renderer and the recognizer.
 */
class MlKitPageRecognizer(context: Context, source: File) : PageRecognizer, AutoCloseable {
  private val renderer: PdfRenderer = RenderSupport.openRenderer(context, Uri.fromFile(source))
  private val client = try {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  } catch (e: Throwable) {
    renderer.close()
    throw e
  }

  override fun recognize(pageIndex: Int): RecognizedPage {
    var bitmap: Bitmap? = null
    try {
      val size = renderer.openPage(pageIndex).use { page ->
        val size = RenderSizing.sizeFor(page.width.toFloat(), page.height.toFloat(), OCR_DPI)
        val image = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
        bitmap = image
        image.eraseColor(Color.WHITE)
        page.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        size
      }
      val text = Tasks.await(client.process(InputImage.fromBitmap(bitmap!!, 0)))
      val words = ArrayList<OcrWord>()
      for (block in text.textBlocks) for (line in block.lines) for (element in line.elements) {
        val box = element.boundingBox ?: continue
        words += OcrWord(element.text, box.left, box.top, box.right, box.bottom)
      }
      return RecognizedPage(size.width, size.height, words)
    } catch (e: OutOfMemoryError) {
      throw OutOfMemoryCodedException(cause = e)
    } catch (e: ExecutionException) {
      throw OcrFailedException(cause = e)
    } finally {
      bitmap?.recycle()
    }
  }

  override fun close() {
    renderer.close()
    client.close()
  }
}
