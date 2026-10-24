package com.pdfkagaz.pdfnative

import android.os.SystemClock

/**
 * Progress and cancellation of running native tool jobs, by job id. An op calls [begin], checks
 * [JobControl.check] between pages and reports [JobControl.progress]; [end] (in a finally) forgets
 * the job. A [cancel] that arrives before [begin] is remembered for [EARLY_CANCEL_TTL_MS].
 */
object NativeJobs {
  const val EARLY_CANCEL_TTL_MS = 60_000L

  /** Monotonic ms for early cancels; System.nanoTime so it also runs in plain JVM tests. */
  internal val DEFAULT_CANCEL_CLOCK: () -> Long = { System.nanoTime() / 1_000_000 }

  @Volatile
  internal var cancelClock: () -> Long = DEFAULT_CANCEL_CLOCK

  private val lock = Any()
  private val running = HashMap<String, JobControl>()
  private val earlyCancels = HashMap<String, Long>()

  /** Registers [jobId]; [emit] receives throttled progress fractions (0..1). */
  fun begin(jobId: String, emit: (Double) -> Unit, clock: () -> Long = SystemClock::elapsedRealtime): JobControl {
    val control = JobControl(emit, clock)
    // One lock with cancel: a cancel either finds the job running or leaves an early cancel that
    // is consumed here, never neither.
    synchronized(lock) {
      val now = cancelClock()
      running[jobId] = control
      val cancelledAt = earlyCancels.remove(jobId)
      if (cancelledAt != null && now - cancelledAt <= EARLY_CANCEL_TTL_MS) control.cancel()
    }
    return control
  }

  /** Cancels [jobId]: its next [JobControl.check] throws ERR_CANCELLED. Unknown ids are remembered. */
  fun cancel(jobId: String) {
    synchronized(lock) {
      val control = running[jobId]
      if (control != null) {
        control.cancel()
        return
      }
      val now = cancelClock()
      earlyCancels.entries.removeIf { now - it.value > EARLY_CANCEL_TTL_MS }
      earlyCancels[jobId] = now
    }
  }

  fun end(jobId: String) {
    synchronized(lock) {
      running.remove(jobId)
      earlyCancels.remove(jobId)
    }
  }
}

/** One job's cancel flag and progress throttle. */
class JobControl internal constructor(private val emit: (Double) -> Unit, private val clock: () -> Long) {
  @Volatile
  private var cancelled = false
  private var lastEmitAt: Long? = null

  internal fun cancel() {
    cancelled = true
  }

  /** Throws ERR_CANCELLED once the job was cancelled. */
  fun check() {
    if (cancelled) throw CancelledException()
  }

  /** Clamps [fraction] to 0..1 (NaN → 0); emits at most every [PROGRESS_INTERVAL_MS], and always at 1.0. */
  @Synchronized
  fun progress(fraction: Double) {
    val value = if (fraction.isNaN()) 0.0 else fraction.coerceIn(0.0, 1.0)
    val now = clock()
    val last = lastEmitAt
    if (value >= 1.0 || last == null || now - last >= PROGRESS_INTERVAL_MS) {
      lastEmitAt = now
      emit(value)
    }
  }

  private companion object {
    const val PROGRESS_INTERVAL_MS = 100L
  }
}
