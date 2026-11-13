package ex.notifica.app

import android.annotation.SuppressLint
import android.content.Context
import org.json.JSONArray

private const val SEEN_MAX = 200

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

  // Address of the alarm schedule, empty with an older server, which only knows the stream
  var scheduleUrl: String
    get() = prefs.getString("scheduleUrl", "") ?: ""
    set(value) = prefs.edit().putString("scheduleUrl", value).apply()

  // The last schedule fetched, minus what already fired
  var schedule: JSONArray
    get() = JSONArray(prefs.getString("schedule", "[]") ?: "[]")
    set(value) = prefs.edit().putString("schedule", value.toString()).apply()

  // Instant updates in the settings | keeps the live connection besides the alarms
  var instant: Boolean
    get() = prefs.getBoolean("instant", false)
    set(value) = prefs.edit().putBoolean("instant", value).apply()

  // False when this reminder already showed, the stream and the alarms may both bring it
  fun firstSight(key: String): Boolean = synchronized(LOCK) {
    val seen = seenList()
    if (seen.contains(key)) return false
    seen.put(key)
    while (seen.length() > SEEN_MAX) seen.remove(0)
    prefs.edit().putString("seen", seen.toString()).apply()
    return true
  }

  fun seen(key: String): Boolean = synchronized(LOCK) { seenList().contains(key) }

  private fun seenList() = JSONArray(prefs.getString("seen", "[]") ?: "[]")

  private fun JSONArray.contains(key: String) = (0 until length()).any { optString(it) == key }

  // Creation time of the last reminder seen, the stream resumes after it
  var since: String
    get() = prefs.getString("since", "") ?: ""
    set(value) = prefs.edit().putString("since", value).apply()

  // The system's permission and battery questions come up once, again when the switch is turned back on
  var asked: Boolean
    get() = prefs.getBoolean("asked", false)
    set(value) = prefs.edit().putBoolean("asked", value).apply()

  // Written at once, the process ends right after this
  @SuppressLint("ApplySharedPref")
  fun forgetServer() {
    prefs.edit()
      .putString("url", "")
      .putString("since", "")
      .putString("scheduleUrl", "")
      .putString("schedule", "[]")
      .putBoolean("changing", true)
      .commit()
  }

  // True once after forgetServer, so the connect page asks instead of opening the saved address
  fun takeChanging(): Boolean {
    val changing = prefs.getBoolean("changing", false)
    if (changing) prefs.edit().putBoolean("changing", false).apply()
    return changing
  }

  private companion object {
    val LOCK = Any()
  }
}
