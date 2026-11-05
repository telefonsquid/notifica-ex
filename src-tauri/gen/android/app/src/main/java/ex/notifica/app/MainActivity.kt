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
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat

// Origin of the bundled connect page
private const val LOCAL = "http://tauri.localhost"

class MainActivity : TauriActivity() {
  // Back is handled below instead
  override val handleBackNavigation = false

  private lateinit var prefs: ReminderPrefs
  private var webView: WebView? = null

  // Where a tapped notification wants to go, while no page of the server is up yet
  private var pendingLink: String? = null

  private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
    tellPage()
    askBatteryExemption()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    prefs = ReminderPrefs(this)
    pendingLink = intent.getStringExtra(EXTRA_LINK)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val link = intent.getStringExtra(EXTRA_LINK) ?: return
    val view = webView
    if (view == null || view.url.orEmpty().startsWith(LOCAL)) pendingLink = link
    else view.loadUrl(link)
  }

  override fun onResume() {
    super.onResume()
    tellPage() // May come back from the system settings
  }

  // The settings page reads the new state after this
  private fun tellPage() {
    webView?.evaluateJavascript("window.dispatchEvent(new Event('notifica-android'))", null)
  }

  private fun allowed() = getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  // Doze cuts the connection otherwise, and reminders would arrive hours late
  @SuppressLint("BatteryLife")
  private fun askBatteryExemption() {
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

      // Logged in with this stream | a new address is another account, nothing it missed counts
      @JavascriptInterface
      fun listen(url: String) = runOnUiThread {
        if (url != prefs.url) {
          prefs.url = url
          prefs.since = ""
        }
        if (prefs.enabled) {
          askOnce()
          ReminderService.start(this@MainActivity)
        }
      }

      @JavascriptInterface
      fun stopListening() = runOnUiThread {
        prefs.url = ""
        prefs.since = ""
        ReminderService.stop(this@MainActivity)
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
          ReminderService.start(this@MainActivity)
        } else {
          ReminderService.stop(this@MainActivity)
        }
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
