package ex.notifica.app

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// Status 0 when the server was out of reach | the text only for a 2xx answer
class Answer(val status: Int, val text: String) {
  val ok get() = status in 200..299
}

// One request to the server, a POST when there is a body | blocks, so never on the main thread
fun request(url: String, body: ByteArray? = null, type: String = "application/json", connect: Int = 8_000, read: Int = 15_000): Answer {
  return try {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = connect
      connection.readTimeout = read

      if (body != null) {
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(body.size)
        connection.setRequestProperty("Content-Type", type)
        connection.outputStream.use { it.write(body) }
      }

      val status = connection.responseCode
      val text = if (status in 200..299) connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) } else ""
      Answer(status, text)
    } finally {
      connection.disconnect()
    }
  } catch (_: IOException) {
    Answer(0, "")
  }
}
