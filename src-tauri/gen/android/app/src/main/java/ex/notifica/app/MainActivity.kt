package ex.notifica.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat

// Origin of the bundled connect page
private const val LOCAL = "http://tauri.localhost"

class MainActivity : TauriActivity() {
  // Back is handled below instead
  override val handleBackNavigation = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    // STATUS BAR BRIDGE | the web UI reports its theme, the bar icons follow it instead of the phone's dark mode
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun statusBar(light: Boolean) = runOnUiThread {
        val bars = WindowCompat.getInsetsController(window, window.decorView)
        bars.isAppearanceLightStatusBars = light
        bars.isAppearanceLightNavigationBars = light
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
