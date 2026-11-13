package ex.notifica.app

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread
import org.json.JSONException
import org.json.JSONObject

private const val FOREGROUND_ID = 1
private const val READ_TIMEOUT = 150_000     // A few heartbeats missed, the connection is dead
private const val RETRY_FIRST = 2_000L
private const val RETRY_MAX = 60_000L
private const val WAKE_TIME = 10_000L

// Holds one connection to the server while Instant updates are on, or always with an older server
class ReminderService : Service() {
  private lateinit var prefs: ReminderPrefs
  private lateinit var notifier: ReminderNotifier
  private lateinit var wake: PowerManager.WakeLock

  private var worker: Thread? = null
  @Volatile private var connection: HttpURLConnection? = null
  @Volatile private var stopped = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    prefs = ReminderPrefs(this)
    notifier = ReminderNotifier(this)
    wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "notifica:reminder")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!prefs.enabled || prefs.url.isEmpty() || !ReminderDelivery.live(prefs)) {
      stopSelf()
      return START_NOT_STICKY
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, FOREGROUND_ID, notifier.listening(), type)

    // Already running means the address changed, the loop picks up the new one
    if (worker == null) worker = thread(name = "reminder-stream") { loop() } else reconnect()
    return START_STICKY
  }

  override fun onDestroy() {
    stopped = true
    reconnect()
    worker?.interrupt()
    super.onDestroy()
  }

  private fun reconnect() {
    thread { connection?.disconnect() } // Closing a socket counts as network use, not allowed on the main thread
  }

  private fun loop() {
    var wait = RETRY_FIRST
    while (!stopped) {
      val url = prefs.url
      if (url.isEmpty()) break

      try {
        if (read(url)) wait = RETRY_FIRST
      } catch (_: IOException) {
        // Offline or server away, the wait below covers it
      }
      if (stopped) break

      try {
        Thread.sleep(wait)
      } catch (_: InterruptedException) {
        break
      }
      wait = (wait * 2).coerceAtMost(RETRY_MAX)
    }
    stopSelf()
  }

  // True once the server answered, so the wait starts over after a good connection
  private fun read(url: String): Boolean {
    val since = prefs.since
    val address = if (since.isEmpty()) url else "$url&since=${URLEncoder.encode(since, "UTF-8")}"
    val opened = URL(address).openConnection() as HttpURLConnection
    connection = opened

    try {
      opened.connectTimeout = 15_000
      opened.readTimeout = READ_TIMEOUT

      // The key no longer counts, nothing to wait for until the app hands out a new one
      if (opened.responseCode == 401) {
        prefs.url = ""
        return false
      }
      if (opened.responseCode != 200) return false

      val origin = URL(url).let { "${it.protocol}://${it.authority}" }
      opened.inputStream.bufferedReader().useLines { lines ->
        lines.forEach { line -> if (line.isNotEmpty()) handle(line, origin) }
      }
      return true
    } finally {
      opened.disconnect()
    }
  }

  private fun handle(line: String, origin: String) {
    wake.acquire(WAKE_TIME)
    try {
      val json = JSONObject(line)
      val cursor = json.optString("cursor")
      val first = !json.has("id")

      // The first line of a new connection only says where it starts
      if (first && prefs.since.isNotEmpty()) return
      if (cursor > prefs.since) prefs.since = cursor
      if (first) return

      // A reconnect or an alarm may have shown it already
      if (prefs.firstSight(pushKey(json))) notifier.show(json, origin)
    } catch (_: JSONException) {
      // A line from a newer server, skip it
    } finally {
      if (wake.isHeld) wake.release()
    }
  }

  companion object {
    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, ReminderService::class.java))
      } catch (_: IllegalStateException) {
        // Android refused from the background, the next app start tries again
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ReminderService::class.java))
    }
  }
}

// Back after a restart of the phone or an app update, without the app being opened | alarms are gone after a restart
class StartReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ReminderDelivery.apply(context)
    ReminderDelivery.sync(context)
  }
}
