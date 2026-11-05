package ex.notifica.app

import android.content.Context

// What the reminder service needs to survive a restart of the app or the phone
class ReminderPrefs(context: Context) {
  private val prefs = context.getSharedPreferences("reminders", Context.MODE_PRIVATE)

  // Address of this account's stream, empty once logged out
  var url: String
    get() = prefs.getString("url", "") ?: ""
    set(value) = prefs.edit().putString("url", value).apply()

  // The switch in the settings, on from the start
  var enabled: Boolean
    get() = prefs.getBoolean("enabled", true)
    set(value) = prefs.edit().putBoolean("enabled", value).apply()

  // Creation time of the last reminder seen, the stream resumes after it
  var since: String
    get() = prefs.getString("since", "") ?: ""
    set(value) = prefs.edit().putString("since", value).apply()

  // The system's permission and battery questions come up once, later only from the settings
  var asked: Boolean
    get() = prefs.getBoolean("asked", false)
    set(value) = prefs.edit().putBoolean("asked", value).apply()
}
