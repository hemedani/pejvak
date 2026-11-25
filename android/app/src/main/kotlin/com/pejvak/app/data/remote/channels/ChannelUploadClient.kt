package com.pejvak.app.data.remote.channels

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.pejvak.app.BuildConfig
import com.pejvak.app.data.auth.AuthSession
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink

/**
 * Streams one picked audio file to the `channelAudio.uploadChannelMedia` **multipart act**
 * (plan 07 CHAN-D04, prompt D11). This is the one transport that is not a JSON act: a
 * `POST /lesan` with `multipart/form-data` carrying a text part `lesan-body` (the JSON
 * `{model,act,details}`) and a file part `file` (the picked audio).
 *
 * It returns the durable descriptors the next step needs — `audioUrl` (→ `Track.streamUrl`),
 * `mimeType`, `fileSizeBytes` — and the server-internal `mediaPath` (never cached or shown).
 * `contentHash`/`durationSec` are **not** computed here; the caller adds them on
 * `publishChannelAudio` (prompt D7). The bytes are streamed from the content URI with a
 * progress callback, so a large upload never loads fully into memory.
 */
@Singleton
class ChannelUploadClient @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttp: OkHttpClient,
    private val session: AuthSession,
    private val json: Json,
) {
    data class UploadResult(
        val audioUrl: String,
        val mediaPath: String?,
        val mimeType: String?,
        val fileSizeBytes: Long,
    )

    class ChannelUploadException(message: String) : Exception(message)

    /**
     * Uploads the file at [uri]. [onProgress] receives (bytesSent, totalBytes) on the IO
     * thread. Throws [ChannelUploadException] on a refusal or transport failure — the
     * caller turns it into a non-blocking notice (prompt D6/D9).
     */
    suspend fun uploadAudio(
        uri: String,
        onProgress: (sent: Long, total: Long) -> Unit = { _, _ -> },
    ): UploadResult = upload(uri, kind = "audio", onProgress = onProgress)

    /** Uploads an avatar/gallery image. Returns the durable URL in `audioUrl` (the act's
     *  single URL field); the caller stores it as `avatarUrl`/`gallery[]`. */
    suspend fun uploadImage(
        uri: String,
        onProgress: (sent: Long, total: Long) -> Unit = { _, _ -> },
    ): UploadResult = upload(uri, kind = "image", onProgress = onProgress)

    private suspend fun upload(
        uri: String,
        kind: String,
        onProgress: (sent: Long, total: Long) -> Unit,
    ): UploadResult = withContext(Dispatchers.IO) {
        val parsed = Uri.parse(uri)
        val meta = fileMeta(parsed)
        val lesanBody = buildJsonObject {
            put("model", "channelAudio")
            put("act", "uploadChannelMedia")
            putJsonObject("details") {
                putJsonObject("set") { put("kind", kind) }
                putJsonObject("get") {
                    put("audioUrl", 1); put("mediaPath", 1); put("fileSizeBytes", 1); put("mimeType", 1)
                }
            }
        }
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("lesan-body", json.encodeToString(JsonObject.serializer(), lesanBody))
            .addFormDataPart(
                "file",
                meta.name,
                ProgressRequestBody(parsed, meta.size, meta.mime, onProgress),
            )
            .build()

        val request = Request.Builder()
            .url(BuildConfig.LESAN_BASE_URL)
            .apply { session.current()?.let { header("token", it) } }
            .post(body)
            .build()

        okHttp.newCall(request).execute().use { response ->
            val text = response.body.string()
            if (!response.isSuccessful) {
                throw ChannelUploadException(refusalMessage(text) ?: "Upload failed (${response.code}).")
            }
            val envelope = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                ?: throw ChannelUploadException("The server returned an unreadable upload response.")
            if (envelope["success"]?.jsonPrimitive?.content != "true") {
                throw ChannelUploadException(refusalMessage(text) ?: "The upload was refused.")
            }
            val data = envelope["body"]?.jsonObject ?: JsonObject(emptyMap())
            val audioUrl = data.string("audioUrl")
                ?: throw ChannelUploadException("The upload response had no audio URL.")
            UploadResult(
                audioUrl = audioUrl,
                mediaPath = data.string("mediaPath"),
                mimeType = data.string("mimeType") ?: meta.mime,
                fileSizeBytes = data.long("fileSizeBytes") ?: meta.size,
            )
        }
    }

    private fun JsonObject.string(key: String): String? =
        this[key]?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.jsonPrimitive?.content

    private fun JsonObject.long(key: String): Long? =
        this[key]?.jsonPrimitive?.content?.toDoubleOrNull()?.toLong()

    /** A 501 refusal is `{ success:false, body.message }`; surface the message if present. */
    private fun refusalMessage(text: String): String? = runCatching {
        val envelope = json.parseToJsonElement(text).jsonObject
        envelope["body"]?.jsonObject?.string("message")
    }.getOrNull()

    private data class FileMeta(val name: String, val size: Long, val mime: String)

    private fun fileMeta(uri: Uri): FileMeta {
        var name = "upload"
        var size = 0L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
            }
        }
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        return FileMeta(name, size, mime)
    }

    /** A content-URI request body that copies to the sink with a byte-progress callback. */
    private inner class ProgressRequestBody(
        private val uri: Uri,
        private val total: Long,
        private val mime: String,
        private val onProgress: (Long, Long) -> Unit,
    ) : RequestBody() {
        override fun contentType() = mime.toMediaType()
        override fun contentLength() = if (total > 0) total else -1L

        override fun writeTo(sink: BufferedSink) {
            val input = context.contentResolver.openInputStream(uri)
                ?: throw ChannelUploadException("Could not open the picked file.")
            var sent = 0L
            input.use { stream ->
                val buffer = ByteArray(BUFFER_BYTES)
                while (true) {
                    val read = stream.read(buffer)
                    if (read == -1) break
                    sink.write(buffer, 0, read)
                    sent += read
                    onProgress(sent, if (total > 0) total else sent)
                }
            }
            sink.flush()
        }
    }

    private companion object {
        const val BUFFER_BYTES = 64 * 1024
    }
}
