package ex.notifica.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.core.content.IntentCompat
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.concurrent.thread
import org.json.JSONException
import org.json.JSONObject

private const val STREAM_PATH = "/api/app-stream/"
private const val SHARE_PATH = "/api/app-share/"

// Same as the web app's shrink, phone photos stay small
private const val MAX_EDGE = 2560
private const val SHARED_IMAGE_MAX = 30L * 1024 * 1024

private class SharedImage(val bytes: ByteArray, val type: String)

// SHARE TARGET | stores what another app shared as a new note without showing anything
// Falls back to opening the app when there is no login yet, the server is older or it can't be reached
class ShareActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val shared = intent
    val stream = ReminderPrefs(this).url
    if (!stream.contains(STREAM_PATH)) return openApp(shared)

    val title = shared.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
    val text = shared.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty()
    val uris = imagesIn(shared)
    val share = Uri.parse(stream.replace(STREAM_PATH, SHARE_PATH))

    thread {
      // Read while this activity still holds the right to, it ends with finish
      val images = uris.mapNotNull { read(it) }
      val body = JSONObject().put("title", title).put("text", text).toString()
      val note = post(share, body.toByteArray(), "application/json")?.let { noteIn(it) }

      runOnUiThread { if (note == null) openApp(shared) else finish() }
      if (note == null) return@thread

      val stored = images.count { post(share.buildUpon().appendPath(note).build(), it.bytes, it.type) != null }
      val lost = uris.size - stored
      if (lost > 0) tell(if (lost == 1) "A shared image could not be saved." else "$lost shared images could not be saved.")
    }
  }

  // The app takes it the old way, through the page
  private fun openApp(shared: Intent) {
    startActivity(Intent(shared).setClass(this, MainActivity::class.java).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  private fun tell(message: String) = Handler(Looper.getMainLooper()).post {
    Toast.makeText(applicationContext, message, Toast.LENGTH_LONG).show()
  }

  private fun imagesIn(intent: Intent): List<Uri> {
    if (intent.action == Intent.ACTION_SEND) return listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
    return IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
  }

  // Null when the other app no longer hands it out or it is far too big
  private fun read(uri: Uri): SharedImage? {
    return try {
      val type = contentResolver.getType(uri) ?: return null
      val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: return null
      if (size > SHARED_IMAGE_MAX) return null
      shrink(uri, type) ?: contentResolver.openInputStream(uri)?.use { SharedImage(it.readBytes(), type) }
    } catch (_: IOException) {
      null
    } catch (_: SecurityException) {
      null
    }
  }

  // Big photos scaled down to WebP, turned upright | GIFs keep their animation, older phones send the original
  private fun shrink(uri: Uri, type: String): SharedImage? {
    if (type == "image/gif" || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return try {
      val source = ImageDecoder.createSource(contentResolver, uri)
      val bitmap = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
        val scale = minOf(1f, MAX_EDGE.toFloat() / maxOf(info.size.width, info.size.height))
        decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
      }
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 85, out)
      SharedImage(out.toByteArray(), "image/webp")
    } catch (_: Exception) {
      null
    }
  }

  // The new note's id, null when something other than this app's server answered
  private fun noteIn(answer: String): String? {
    return try {
      JSONObject(answer).optString("id").ifEmpty { null }
    } catch (_: JSONException) {
      null
    }
  }

  // The answer's text, null on any failure
  private fun post(url: Uri, body: ByteArray, type: String): String? =
    request(url.toString(), body, type, read = 30_000).takeIf { it.ok }?.text
}
