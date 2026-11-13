package ex.notifica.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.IntentCompat
import androidx.core.view.WindowCompat
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

// Origin of the bundled connect page
private const val LOCAL = "http://tauri.localhost"

// The bridge hands images over as text, far bigger ones would run the webview out of memory
private const val SHARED_IMAGE_MAX = 30L * 1024 * 1024

class MainActivity : TauriActivity() {
  // Back is handled below instead
  override val handleBackNavigation = false

  private lateinit var prefs: ReminderPrefs
  private var webView: WebView? = null

  // Where a tapped notification wants to go, while no page of the server is up yet
  private var pendingLink: String? = null

  // What another app shared, until a page of the server takes it
  private var pendingShare: Intent? = null
  private var sharedImages: List<Uri> = emptyList()

  private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
    tellPage()
    askBatteryExemption()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    prefs = ReminderPrefs(this)
    pendingLink = intent.getStringExtra(EXTRA_LINK)
    if (savedInstanceState == null) receiveShare(intent)
  }

  private fun receiveShare(intent: Intent) {
    if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) pendingShare = intent
  }

  private fun imagesIn(intent: Intent): List<Uri> {
    if (intent.action == Intent.ACTION_SEND) return listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
    return IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
  }

  // As a data address, null when the other app no longer hands it out or it is too big
  private fun readImage(uri: Uri): String? {
    return try {
      val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: return null
      if (size > SHARED_IMAGE_MAX) return null
      val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
      "data:${contentResolver.getType(uri)};base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    } catch (_: IOException) {
      null
    } catch (_: SecurityException) {
      null
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    receiveShare(intent)
    val link = intent.getStringExtra(EXTRA_LINK) ?: return
    val view = webView
    if (view == null || view.url.orEmpty().startsWith(LOCAL)) pendingLink = link
    else view.loadUrl(link)
  }

  override fun onResume() {
    super.onResume()
    tellPage() // May come back from the system settings
    ReminderDelivery.sync(this)
  }

  // Edits made in the app reach the alarms before it goes to sleep
  override fun onStop() {
    super.onStop()
    ReminderDelivery.sync(this)
  }

  // The settings page reads the new state after this
  private fun tellPage() {
    webView?.evaluateJavascript("window.dispatchEvent(new Event('notifica-android'))", null)
  }

  private fun allowed() = getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  // Doze cuts the live connection otherwise | alarms need no exemption
  @SuppressLint("BatteryLife")
  private fun askBatteryExemption() {
    if (!ReminderDelivery.live(prefs)) return
    if (getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)) return
    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
  }

  private fun askOnce() {
    if (prefs.asked) return
    prefs.asked = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !allowed()) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    else askBatteryExemption()
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView

    // BRIDGE | the only native calls pages of the server get
    webView.addJavascriptInterface(object {

      // Bar icons follow the web UI's theme instead of the phone's dark mode
      @JavascriptInterface
      fun statusBar(light: Boolean) = runOnUiThread {
        val bars = WindowCompat.getInsetsController(window, window.decorView)
        bars.isAppearanceLightStatusBars = light
        bars.isAppearanceLightNavigationBars = light
      }

      // Comes before listen | a page of an older server never calls it and the stream stays in charge
      @JavascriptInterface
      fun setSchedule(url: String) = runOnUiThread {
        if (url != prefs.scheduleUrl) {
          prefs.scheduleUrl = url
          prefs.schedule = JSONArray()
        }
      }

      // Logged in with this stream | a new address is another account, nothing it missed counts
      @JavascriptInterface
      fun listen(url: String) = runOnUiThread {
        if (url != prefs.url) {
          prefs.url = url
          prefs.since = ""
        }
        if (prefs.enabled) askOnce()
        ReminderDelivery.apply(this@MainActivity)
        ReminderDelivery.sync(this@MainActivity)
      }

      @JavascriptInterface
      fun stopListening() = runOnUiThread {
        prefs.url = ""
        prefs.since = ""
        prefs.scheduleUrl = ""
        prefs.schedule = JSONArray()
        ReminderDelivery.apply(this@MainActivity)
      }

      @JavascriptInterface
      fun notificationsOn() = prefs.enabled

      @JavascriptInterface
      fun notificationsAllowed() = allowed()

      // Reminders from the time it was off stay off, turning on starts from now
      @JavascriptInterface
      fun setNotifications(on: Boolean) = runOnUiThread {
        prefs.enabled = on
        if (on) {
          prefs.since = ""
          prefs.asked = false
          askOnce()
        }
        ReminderDelivery.apply(this@MainActivity)
        ReminderDelivery.sync(this@MainActivity)
      }

      @JavascriptInterface
      fun instantOn() = prefs.instant

      @JavascriptInterface
      fun setInstant(on: Boolean) = runOnUiThread {
        prefs.instant = on
        if (on) {
          prefs.since = ""
          askBatteryExemption()
        }
        ReminderDelivery.apply(this@MainActivity)
      }

      // Shown by the phone itself, the server's test only reaches the live connection
      @JavascriptInterface
      fun testNotification() = runOnUiThread {
        val push = JSONObject().put("id", "test").put("title", "Test reminder").put("message", "Reminders reach this device.")
        ReminderNotifier(this@MainActivity).show(push, "")
      }

      @JavascriptInterface
      fun openNotificationSettings() = runOnUiThread {
        startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
      }

      // A notification tapped before the app ran
      @JavascriptInterface
      fun pendingLink(): String? {
        val link = this@MainActivity.pendingLink
        this@MainActivity.pendingLink = null
        return link
      }

      // A fresh start, Tauri refuses the connect page's calls when it loads in place of a page of the server
      @JavascriptInterface
      fun changeServer() = runOnUiThread {
        prefs.forgetServer()
        ReminderDelivery.apply(this@MainActivity)
        startActivity(Intent.makeRestartActivityTask(packageManager.getLaunchIntentForPackage(packageName)!!.component))
        Runtime.getRuntime().exit(0)
      }

      @JavascriptInterface
      fun changingServer() = prefs.takeChanging()

      // Shown on the About page
      @JavascriptInterface
      fun appVersion(): String = BuildConfig.VERSION_NAME

      @JavascriptInterface
      fun hasShare() = pendingShare != null

      // Handed out once, the images follow one by one through sharedImage
      @JavascriptInterface
      fun takeShare(): String? {
        val shared = pendingShare ?: return null
        pendingShare = null
        sharedImages = imagesIn(shared)
        return JSONObject()
          .put("title", shared.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty())
          .put("text", shared.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty())
          .put("images", sharedImages.size)
          .toString()
      }

      @JavascriptInterface
      fun sharedImage(index: Int) = sharedImages.getOrNull(index)?.let { readImage(it) }
    }, "NotificaAndroid")

    // BACK | closes an open overlay, else walks the server's pages, then hides the app
    // Never back onto the connect page, Tauri still files it under the server's URL and refuses its calls
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("window.closeOverlay?.() === true") { closed ->
          if (closed == "true") return@evaluateJavascript

          val history = webView.copyBackForwardList()
          val previous = history.getItemAtIndex(history.currentIndex - 1)?.url
          if (previous != null && !previous.startsWith(LOCAL)) webView.goBack()
          else moveTaskToBack(true)
        }
      }
    })
  }
}
