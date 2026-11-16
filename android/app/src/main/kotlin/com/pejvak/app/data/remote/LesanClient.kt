package com.pejvak.app.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.network.sockets.ConnectTimeoutException
import io.ktor.client.network.sockets.SocketTimeoutException
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Typed wrapper over the Lesan wire protocol. Requests are POST bodies shaped
 * `{ model, act, details: { set, get } }`; the JWT travels in the `token` header
 * with NO `Bearer` prefix; the response envelope `{ success, body }` is
 * authoritative. The full act surface + sync engine land in Phase 5.
 */
@Singleton
class LesanClient @Inject constructor(
    private val http: HttpClient,
    private val baseUrl: String,
) {
    @Serializable
    data class Details(val set: JsonElement? = null, val get: JsonElement? = null)

    @Serializable
    data class Request(val model: String, val act: String, val details: Details)

    @Serializable
    data class Envelope(val success: Boolean, val body: JsonElement? = null)

    suspend fun call(
        model: String,
        act: String,
        set: JsonElement? = null,
        get: JsonElement? = null,
        token: String? = null,
    ): Envelope {
        val response = http.post(baseUrl) {
            contentType(ContentType.Application.Json)
            if (token != null) header("token", token)
            setBody(Request(model, act, Details(set, get)))
        }
        return response.body()
    }

    /**
     * Calls an act and returns the authoritative `body`, classifying every failure
     * into a [LesanException] (mirrors client.ts). The envelope's `success` flag is
     * checked before the body is read; a 15 s timeout bounds every request.
     */
    suspend fun callBody(
        model: String,
        act: String,
        set: JsonElement? = null,
        get: JsonElement? = null,
        token: String? = null,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    ): JsonElement {
        val envelope = try {
            withTimeout(timeoutMs) { call(model, act, set, get, token) }
        } catch (error: Exception) {
            throw classifyTransportFailure(error)
        }
        if (!envelope.success) {
            throw LesanException("API act returned an error.", LesanErrorCode.Validation, details = envelope.body)
        }
        return envelope.body ?: throw LesanException("Invalid API response envelope.", LesanErrorCode.InvalidResponse)
    }

    private fun classifyTransportFailure(error: Exception): LesanException = when (error) {
        is LesanException -> error
        is TimeoutCancellationException, is HttpRequestTimeoutException, is SocketTimeoutException, is ConnectTimeoutException ->
            LesanException("Request timed out.", LesanErrorCode.Timeout)
        is CancellationException -> LesanException("Request was cancelled.", LesanErrorCode.Cancelled)
        is SerializationException -> LesanException("Response was incomplete.", LesanErrorCode.InvalidResponse)
        is IOException -> LesanException("Network request failed.", LesanErrorCode.Offline)
        else -> {
            val message = error.message ?: ""
            when {
                Regex("cancel|abort", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
                    LesanException("Request was cancelled.", LesanErrorCode.Cancelled)
                Regex("json|unexpected end of input", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
                    LesanException("Response was incomplete.", LesanErrorCode.InvalidResponse)
                else -> LesanException("Unexpected request failure.", LesanErrorCode.Unknown, details = message)
            }
        }
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 15_000L
    }
}