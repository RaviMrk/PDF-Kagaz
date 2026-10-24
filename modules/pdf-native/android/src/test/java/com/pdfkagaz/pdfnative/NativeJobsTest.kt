package com.pdfkagaz.pdfnative

import expo.modules.kotlin.exception.CodedException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import java.util.concurrent.CyclicBarrier

class NativeJobsTest {
  private var now = 0L
  private val emitted = ArrayList<Double>()
  private val ids = ArrayList<String>()

  private fun begin(id: String): JobControl {
    ids += id
    return NativeJobs.begin(id, { emitted += it }, { now })
  }

  @After
  fun tearDown() {
    ids.forEach(NativeJobs::end)
    NativeJobs.cancelClock = NativeJobs.DEFAULT_CANCEL_CLOCK
  }

  @Test
  fun checkPassesUntilCancelled() {
    val job = begin("j-cancel")
    job.check()
    NativeJobs.cancel("j-cancel")
    assertCancelled(job)
    // Stays cancelled.
    assertCancelled(job)
  }

  @Test
  fun cancelBeforeBeginIsRemembered() {
    ids += "j-early"
    NativeJobs.cancel("j-early")
    assertCancelled(begin("j-early"))
  }

  @Test
  fun cancelBeforeBeginExpiresAfterSixtySeconds() {
    var t = 1_000L
    NativeJobs.cancelClock = { t }
    ids += "j-stale"
    NativeJobs.cancel("j-stale")
    t += 60_001
    begin("j-stale").check()
  }

  @Test
  fun cancelArrivingWhileBeginRegistersIsNotLost() {
    // begin reads the cancel clock while registering; a cancel landing at that moment must stick.
    var fired = false
    NativeJobs.cancelClock = {
      if (!fired) {
        fired = true
        NativeJobs.cancel("j-race")
      }
      0L
    }
    assertCancelled(begin("j-race"))
  }

  @Test
  fun concurrentCancelAndBeginNeverLoseTheCancel() {
    repeat(2_000) { i ->
      val id = "j-con-$i"
      ids += id
      val barrier = CyclicBarrier(2)
      val canceller = Thread {
        barrier.await()
        NativeJobs.cancel(id)
      }
      canceller.start()
      barrier.await()
      val job = NativeJobs.begin(id, {}, { 0L })
      canceller.join()
      assertCancelled(job)
    }
  }

  @Test
  fun cancellingOneJobLeavesOthersRunning() {
    val a = begin("j-a")
    val b = begin("j-b")
    NativeJobs.cancel("j-a")
    assertCancelled(a)
    b.check()
  }

  @Test
  fun progressIsThrottledTo100Ms() {
    val job = begin("j-progress")
    now = 0
    job.progress(0.1)
    now = 50
    job.progress(0.2)
    now = 120
    job.progress(0.3)
    assertEquals(listOf(0.1, 0.3), emitted)
  }

  @Test
  fun completionAlwaysEmits() {
    val job = begin("j-done")
    job.progress(0.5)
    now = 10
    job.progress(1.0)
    now = 20
    job.progress(1.0)
    assertEquals(listOf(0.5, 1.0, 1.0), emitted)
  }

  @Test
  fun progressIsClamped() {
    val job = begin("j-clamp")
    job.progress(-0.5)
    now = 200
    job.progress(7.0)
    now = 400
    job.progress(Double.NaN)
    assertEquals(listOf(0.0, 1.0, 0.0), emitted)
  }

  @Test
  fun endForgetsTheJob() {
    val first = begin("j-end")
    NativeJobs.cancel("j-end")
    assertCancelled(first)
    NativeJobs.end("j-end")
    begin("j-end").check()
  }

  private fun assertCancelled(job: JobControl) {
    try {
      job.check()
      fail("Expected ERR_CANCELLED")
    } catch (e: CodedException) {
      assertEquals("ERR_CANCELLED", e.code)
    }
  }
}
