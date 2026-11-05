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
private const val EXTRA_SIGNATURE = "signature"
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
      .setContentText(message)
      .setStyle(NotificationCompat.BigTextStyle().bigText(message))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(open(click?.let { origin + it }, id))

    push.optJSONObject("done")?.let { done ->
      val intent = Intent(context, DoneReceiver::class.java)
        .putExtra(EXTRA_URL, origin + done.getString("path"))
        .putExtra(EXTRA_SIGNATURE, done.getString("signature"))
        .putExtra(EXTRA_NOTIFICATION, id)
      builder.addAction(0, "Done", PendingIntent.getBroadcast(context, id, intent, PENDING_FLAGS))
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

// DONE BUTTON | the signed link needs no login, so this works with the app closed
class DoneReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val url = intent.getStringExtra(EXTRA_URL) ?: return
    val signature = intent.getStringExtra(EXTRA_SIGNATURE) ?: return
    val id = intent.getIntExtra(EXTRA_NOTIFICATION, 0)
    val pending = goAsync()

    thread {
      try {
        if (post(url, signature)) context.getSystemService(NotificationManager::class.java).cancel(id) // Stays up when it failed, for another try
      } finally {
        pending.finish()
      }
    }
  }

  private fun post(url: String, signature: String): Boolean {
    return try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 8_000
      connection.readTimeout = 8_000
      connection.requestMethod = "POST"
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(JSONObject().put("signature", signature).toString().toByteArray()) }
      connection.responseCode in 200..299
    } catch (_: IOException) {
      false
    }
  }
}
