package ex.notifica.app

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.AlarmManagerCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.net.URL
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val SYNC_PERIODIC = "schedule-sync"
private const val SYNC_NOW = "schedule-sync-now"
private const val SYNC_MINUTES = 15L
private const val MISSED_KEEP = 12 * 60 * 60 * 1000L     // Phone off longer than this, the reminders are stale
private const val RETRY_TRIES = 10

// ALARMS BY DEFAULT | the phone sets exact alarms from the server's schedule and fetches it again now and then
// The live stream runs only with Instant updates on or against an older server without a schedule
object ReminderDelivery {

  fun live(prefs: ReminderPrefs) = prefs.instant || prefs.scheduleUrl.isEmpty()

  // Brings service, alarms and syncing in line with the prefs | safe to call any number of times
  fun apply(context: Context) {
    val prefs = ReminderPrefs(context)
    val work = WorkManager.getInstance(context)
    val alarms = prefs.enabled && prefs.scheduleUrl.isNotEmpty()

    if (prefs.enabled && prefs.url.isNotEmpty() && live(prefs)) ReminderService.start(context)
    else ReminderService.stop(context)

    if (!alarms) {
      cancelAlarm(context)
      work.cancelUniqueWork(SYNC_PERIODIC)
      work.cancelUniqueWork(SYNC_NOW)
      return
    }

    val periodic = PeriodicWorkRequestBuilder<ScheduleSync>(SYNC_MINUTES, TimeUnit.MINUTES).setConstraints(online()).build()
    work.enqueueUniquePeriodicWork(SYNC_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, periodic)
    arm(context)
  }

  // Fetch the schedule soon, after anything that may have changed it
  fun sync(context: Context) {
    val prefs = ReminderPrefs(context)
    if (!prefs.enabled || prefs.scheduleUrl.isEmpty()) return
    val request = OneTimeWorkRequestBuilder<ScheduleSync>().setConstraints(online()).build()
    WorkManager.getInstance(context).enqueueUniqueWork(SYNC_NOW, ExistingWorkPolicy.REPLACE, request)
  }

  // One alarm for the soonest entry, a past one fires right away
  fun arm(context: Context) {
    val soonest = ReminderPrefs(context).schedule.entries().minOfOrNull { atOf(it) }
    if (soonest == null) {
      cancelAlarm(context)
      return
    }

    val manager = context.getSystemService(AlarmManager::class.java)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
    if (exact) AlarmManagerCompat.setExactAndAllowWhileIdle(manager, AlarmManager.RTC_WAKEUP, soonest, alarmIntent(context))
    else AlarmManagerCompat.setAndAllowWhileIdle(manager, AlarmManager.RTC_WAKEUP, soonest, alarmIntent(context)) // Permission taken back, a few minutes late beats none
  }

  private fun cancelAlarm(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context))
  }

  private fun alarmIntent(context: Context) =
    PendingIntent.getBroadcast(context, 0, Intent(context, AlarmReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun online() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
}

// The slot ends in the time in milliseconds, simpler to read than the ISO date on older Android
fun atOf(entry: JSONObject): Long = entry.optString("slot").substringAfterLast('@').toLongOrNull() ?: 0L

fun JSONArray.entries(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

fun originOf(url: String) = URL(url).let { "${it.protocol}://${it.authority}" }

// ALARM | shows what is due, keeps the rest and sets the next alarm
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val prefs = ReminderPrefs(context)
    if (!prefs.enabled || prefs.scheduleUrl.isEmpty()) return

    val now = System.currentTimeMillis()
    val notifier = ReminderNotifier(context)
    val origin = originOf(prefs.scheduleUrl)
    val (due, later) = prefs.schedule.entries().partition { atOf(it) <= now }

    for (entry in due) if (prefs.firstSight(pushKey(entry))) notifier.show(entry, origin)
    prefs.schedule = JSONArray(later)
    ReminderDelivery.arm(context)
    ReminderDelivery.sync(context)
  }
}

// SYNC | replaces the stored schedule with the server's
class ScheduleSync(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val prefs = ReminderPrefs(applicationContext)
    val url = prefs.scheduleUrl
    if (!prefs.enabled || url.isEmpty()) return Result.success()

    val answer = request(url)
    when (answer.status) {
      200 -> try {
        store(prefs, JSONObject(answer.text).getJSONArray("entries"))
      } catch (_: JSONException) {
        return Result.success() // A newer server's answer, the next app update reads it
      }

      // The key no longer counts, nothing to fetch until the app hands out a new one
      401 -> {
        prefs.url = ""
        prefs.scheduleUrl = ""
        prefs.schedule = JSONArray()
      }

      // A server rolled back to a version without schedules, the stream takes over
      404 -> {
        prefs.scheduleUrl = ""
        prefs.schedule = JSONArray()
      }

      else -> return Result.retry()
    }
    ReminderDelivery.apply(applicationContext)
    return Result.success()
  }

  // Missed ones stay while the phone was off or offline, the server already moved past them
  // Shown ones go, the server lists a time until its dispatch run moved on and the alarm would fire again and again
  private fun store(prefs: ReminderPrefs, entries: JSONArray) {
    val now = System.currentTimeMillis()
    val fresh = entries.entries().filterNot { prefs.seen(pushKey(it)) }
    val known = fresh.map { pushKey(it) }.toSet()
    val missed = prefs.schedule.entries().filter { atOf(it) <= now && now - atOf(it) < MISSED_KEEP && pushKey(it) !in known }
    prefs.schedule = JSONArray(missed + fresh)
  }
}

// DONE PRESSED TOO EARLY | the server logs a reminder in the minute it is due, the button may beat it
// The notification stays until it went through, so a press that never lands can be repeated
object ActionRetry {
  fun later(context: Context, url: String, body: String, notification: Int) {
    val data = Data.Builder().putString("url", url).putString("body", body).putInt("notification", notification).build()
    val request = OneTimeWorkRequestBuilder<ActionWorker>()
      .setInitialDelay(1, TimeUnit.MINUTES)
      .setBackoffCriteria(BackoffPolicy.LINEAR, 1, TimeUnit.MINUTES)
      .setInputData(data)
      .build()
    WorkManager.getInstance(context).enqueue(request)
  }
}

class ActionWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val url = inputData.getString("url") ?: return Result.failure()
    val body = inputData.getString("body") ?: return Result.failure()
    val status = request(url, body.toByteArray()).status
    if (actionSettled(status)) applicationContext.getSystemService(NotificationManager::class.java).cancel(inputData.getInt("notification", 0))
    return when {
      actionSettled(status) -> Result.success()
      (status == 409 || status == 0) && runAttemptCount < RETRY_TRIES -> Result.retry()
      else -> Result.failure()
    }
  }
}
