package com.pdfkagaz.pdfnative

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the process in the foreground while a tool job runs (type dataSync: local file processing),
 * with an ongoing, silent progress notification whose **Cancel** stops the job. Started by the
 * module while the app is in the foreground ([ACTION_START]); [ACTION_UPDATE] / [ACTION_STOP] come
 * from JS through the module. `stopWithTask="false"`: swiping the app away mid-job ends the process
 * in [onTaskRemoved], and the interrupted job is reported at the next start. All intents arrive on the main thread, in order.
 */
class ToolJobService : Service() {
  private var jobId: String? = null
  private var builder: NotificationCompat.Builder? = null
  private var lastUpdateAt: Long? = null
  private var lastPercent = 0
  private val handler = Handler(Looper.getMainLooper())

  /** A cancel JS never answers with a stop (its context is gone) must not leave the service running. */
  private val stopAfterCancel = Runnable { stopNow() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra(EXTRA_JOB_ID)
    when (intent?.action) {
      ACTION_START -> start(intent)
      ACTION_UPDATE -> if (id != null && id == jobId) update(intent.getDoubleExtra(EXTRA_FRACTION, 0.0)) else stopIfIdle()
      ACTION_CANCEL -> if (id != null && id == jobId) cancel(id) else stopIfIdle()
      ACTION_STOP -> if (id == null || id == jobId) stopNow() else stopIfIdle()
      else -> stopIfIdle()
    }
    // Never restarted after a process death: the job died with the process.
    return START_NOT_STICKY
  }

  /** Android 15+: the dataSync time budget is used up. The job is cancelled and the service stops at once. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    jobId?.let { NativeJobs.cancel(it); JobNoticeBus.cancelRequested(it) }
    stopNow()
  }

  /**
   * The app's task was removed (Recents swipe). With a job running and no task left, the process is
   * ended (the FGS would otherwise keep it alive, cached and soon frozen, mid-job); the next start
   * reports the job as interrupted. Originals are never touched; leftovers are cleaned at that start.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val tasks = try {
      getSystemService(ActivityManager::class.java)?.appTasks?.size ?: 0
    } catch (e: Exception) {
      // Unknown: assume a task is still there, so a visible app is never ended.
      1
    }
    if (JobNoticeRules.endProcessOnTaskRemoved(jobId != null, tasks)) {
      stopNow()
      Process.killProcess(Process.myPid())
    } else if (jobId == null) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    handler.removeCallbacks(stopAfterCancel)
    jobId = null
    builder = null
    super.onDestroy()
  }

  private fun start(intent: Intent) {
    val id = intent.getStringExtra(EXTRA_JOB_ID).orEmpty()
    val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
    val cancelLabel = intent.getStringExtra(EXTRA_CANCEL_LABEL).orEmpty()
    val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME).orEmpty()
    handler.removeCallbacks(stopAfterCancel)
    ensureChannel(this, CHANNEL_PROGRESS, channelName.ifEmpty { title }, NotificationManager.IMPORTANCE_LOW)
    val cancel = PendingIntent.getService(
      this,
      REQUEST_CANCEL,
      Intent(this, ToolJobService::class.java).setAction(ACTION_CANCEL).putExtra(EXTRA_JOB_ID, id),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val b = NotificationCompat.Builder(this, CHANNEL_PROGRESS)
      .setSmallIcon(R.drawable.pdf_native_notice)
      .setContentTitle(title)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setProgress(100, 0, false)
      .setContentIntent(contentIntent(this, id, REQUEST_OPEN_PROGRESS))
      .addAction(0, cancelLabel, cancel)
    try {
      // Called first on every start: startForegroundService requires it.
      ServiceCompat.startForeground(this, NOTIFICATION_ID, b.build(), fgsType())
    } catch (e: Exception) {
      // Refused (e.g. ForegroundServiceStartNotAllowedException): the job runs without a notice.
      jobId = null
      stopSelf()
      return
    }
    if (!ToolPaths.isValidJobId(id)) {
      stopNow()
      return
    }
    jobId = id
    builder = b
    lastUpdateAt = null
    lastPercent = 0
  }

  private fun update(fraction: Double) {
    val b = builder ?: return
    val percent = JobNoticeRules.percentOf(fraction)
    val now = SystemClock.elapsedRealtime()
    if (!JobNoticeRules.shouldUpdate(lastUpdateAt, now, lastPercent, percent)) return
    lastUpdateAt = now
    lastPercent = percent
    notify(b.setProgress(100, percent, false).build())
  }

  private fun cancel(id: String) {
    NativeJobs.cancel(id)
    JobNoticeBus.cancelRequested(id)
    handler.removeCallbacks(stopAfterCancel)
    handler.postDelayed(stopAfterCancel, CANCEL_STOP_GRACE_MS)
  }

  private fun stopIfIdle() {
    if (jobId == null) stopSelf()
  }

  /** Every deliberate stop goes through here (or clears [jobId] first). */
  private fun stopNow() {
    handler.removeCallbacks(stopAfterCancel)
    jobId = null
    builder = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun notify(notification: Notification) {
    try {
      // The foreground notice itself; without POST_NOTIFICATIONS it is simply not shown.
      getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
    } catch (e: Exception) {
      // The progress bar stays where it was.
    }
  }

  private fun fgsType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0

  companion object {
    const val ACTION_START = "com.pdfkagaz.pdfnative.action.JOB_START"
    const val ACTION_UPDATE = "com.pdfkagaz.pdfnative.action.JOB_UPDATE"
    const val ACTION_CANCEL = "com.pdfkagaz.pdfnative.action.JOB_CANCEL"
    const val ACTION_STOP = "com.pdfkagaz.pdfnative.action.JOB_STOP"
    const val EXTRA_JOB_ID = "jobId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_CANCEL_LABEL = "cancelLabel"
    const val EXTRA_CHANNEL_NAME = "channelName"
    const val EXTRA_FRACTION = "fraction"

    const val CHANNEL_PROGRESS = "tool_progress"
    const val CHANNEL_DONE = "tool_done"
    private const val NOTIFICATION_ID = 7101
    private const val DONE_NOTIFICATION_ID = 7102
    private const val REQUEST_CANCEL = 1
    private const val REQUEST_OPEN_PROGRESS = 2
    private const val REQUEST_OPEN_DONE = 3
    private const val CANCEL_STOP_GRACE_MS = 30_000L

    /**
     * "Finished" / "couldn't finish" notice of [jobId] (one per job, tagged by its id), opening its
     * result. False when notifications are off or not permitted.
     */
    fun postDone(context: Context, jobId: String, title: String, body: String, channelName: String): Boolean {
      if (!ToolPaths.isValidJobId(jobId)) return false
      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) return false
      ensureChannel(context, CHANNEL_DONE, channelName.ifEmpty { title }, NotificationManager.IMPORTANCE_DEFAULT)
      val notification = NotificationCompat.Builder(context, CHANNEL_DONE)
        .setSmallIcon(R.drawable.pdf_native_notice)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setContentIntent(contentIntent(context, jobId, REQUEST_OPEN_DONE))
        .build()
      return try {
        context.getSystemService(NotificationManager::class.java)?.notify(jobId, DONE_NOTIFICATION_ID, notification)
        true
      } catch (e: SecurityException) {
        false
      }
    }

    private fun ensureChannel(context: Context, id: String, name: String, importance: Int) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      // Re-creating updates the name (language changes); importance stays as the user set it.
      context.getSystemService(NotificationManager::class.java)
        ?.createNotificationChannel(NotificationChannel(id, name, importance))
    }

    /** Opens the job's result (or Home) in this app; immutable. */
    private fun contentIntent(context: Context, jobId: String, requestCode: Int): PendingIntent {
      val open = Intent(Intent.ACTION_VIEW, Uri.parse(JobNoticeRules.resultDeepLink(jobId)))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(
        context,
        requestCode,
        open,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
  }
}
