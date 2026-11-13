package ex.notifica.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import org.json.JSONObject

private const val CHANNEL_REMINDERS = "reminders"
private const val CHANNEL_LISTENING = "listening"

const val EXTRA_LINK = "link"
private const val EXTRA_URL = "url"
private const val EXTRA_BODY = "body"
private const val EXTRA_NOTIFICATION = "notification"

private const val PENDING_FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

class ReminderNotifier(private val context: Context) {
  private val manager = context.getSystemService(NotificationManager::class.java)

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_REMINDERS, "Reminders", NotificationManager.IMPORTANCE_HIGH))
      manager.createNotificationChannel(NotificationChannel(CHANNEL_LISTENING, "Waiting for reminders", NotificationManager.IMPORTANCE_MIN))
    }
  }

  // The quiet one Android demands for as long as the service runs
  fun listening() = NotificationCompat.Builder(context, CHANNEL_LISTENING)
    .setSmallIcon(R.drawable.ic_notification)
    .setContentTitle("Waiting for reminders")
    .setPriority(NotificationCompat.PRIORITY_MIN)
    .setOngoing(true)
    .setContentIntent(open(null, 0))
    .build()

  // One line of the stream, its paths are relative to the server
  fun show(push: JSONObject, origin: String) {
    val id = push.getString("id").hashCode()
    val message = push.optString("message")
    val click = push.optString("click").ifEmpty { null }
    val builder = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(push.optString("title"))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(open(click?.let { origin + it }, id))

    // A note without text shows its title alone
    if (message.isNotBlank()) builder.setContentText(message).setStyle(NotificationCompat.BigTextStyle().bigText(message))

    // The request code tells the buttons apart, Android treats intents differing only in extras as one
    fun button(label: String, code: Int, link: JSONObject, until: String? = null) {
      val body = JSONObject().put("signature", link.getString("signature"))
      if (until != null) body.put("until", until)
      val intent = Intent(context, ActionReceiver::class.java)
        .putExtra(EXTRA_URL, origin + link.getString("path"))
        .putExtra(EXTRA_BODY, body.toString())
        .putExtra(EXTRA_NOTIFICATION, id)
      builder.addAction(0, label, PendingIntent.getBroadcast(context, code, intent, PENDING_FLAGS))
    }

    push.optJSONObject("done")?.let { button("Done", id, it) }

    // Reschedule opens the app with every choice | an older server only knows the two fixed ones
    val reschedule = push.optString("reschedule").ifEmpty { null }
    if (reschedule != null) builder.addAction(0, "Reschedule", open(origin + reschedule, id + 1))
    else push.optJSONObject("snooze")?.let {
      button("1 hour", id + 1, it, "hour")
      button("Tomorrow", id + 2, it, "tomorrow")
    }

    manager.notify(id, builder.build())
  }

  private fun open(link: String?, requestCode: Int): PendingIntent {
    val intent = Intent(context, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(EXTRA_LINK, link)
    return PendingIntent.getActivity(context, requestCode, intent, PENDING_FLAGS)
  }
}

// DONE AND SNOOZE BUTTONS | the signed link needs no login, so this works with the app closed
class ActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val url = intent.getStringExtra(EXTRA_URL) ?: return
    val body = intent.getStringExtra(EXTRA_BODY) ?: return
    val id = intent.getIntExtra(EXTRA_NOTIFICATION, 0)
    val pending = goAsync()

    thread {
      try {
        if (post(url, body)) context.getSystemService(NotificationManager::class.java).cancel(id) // Stays up when it failed, for another try
      } finally {
        pending.finish()
      }
    }
  }

  private fun post(url: String, body: String): Boolean {
    return try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 8_000
      connection.readTimeout = 8_000
      connection.requestMethod = "POST"
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toByteArray()) }
      connection.responseCode in 200..299
    } catch (_: IOException) {
      false
    }
  }
}
