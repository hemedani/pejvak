package com.pejvak.app.data.remote.online

import io.ktor.client.HttpClient
import io.ktor.client.network.sockets.ConnectTimeoutException
import io.ktor.client.network.sockets.SocketTimeoutException
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * The one way an online adapter talks to a stranger's server (mirrors
 * online/transport.ts): bounded time, typed failure, and no raw parse errors
 * escaping to a screen.
 */
@Singleton
class OnlineTransport @Inject constructor(private val http: HttpClient) {
    suspend fun getJson(
        url: String,
        headers: Map<String, String> = emptyMap(),
    ): JsonElement {
        val text = get(url, "application/json", headers)
        return try {
            Json.parseToJsonElement(text)
        } catch (error: SerializationException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.InvalidResponse,
                "The source sent something unreadable.",
                error,
            )
        }
    }

    suspend fun getText(url: String, headers: Map<String, String> = emptyMap()): String =
        get(url, "text/html", headers)

    private suspend fun get(url: String, accept: String, headers: Map<String, String>): String {
        val response = try {
            withTimeout(DEFAULT_TIMEOUT_MS) {
                http.get(url) {
                    header("Accept", accept)
                    headers.forEach { (name, value) -> header(name, value) }
                }
            }
        } catch (error: TimeoutCancellationException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.Timeout,
                "The source took too long to answer.",
                error,
            )
        } catch (error: ConnectTimeoutException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.Timeout,
                "The source took too long to answer.",
                error,
            )
        } catch (error: SocketTimeoutException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.Timeout,
                "The source took too long to answer.",
                error,
            )
        } catch (error: IOException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.Offline,
                "Could not reach the source.",
                error,
            )
        }
        if (!response.status.isSuccess()) {
            throw OnlineTransportException(
                if (response.status == HttpStatusCode.NotFound) {
                    com.pejvak.app.domain.online.OnlineErrorCode.NotFound
                } else {
                    com.pejvak.app.domain.online.OnlineErrorCode.InvalidResponse
                },
                if (response.status == HttpStatusCode.NotFound) {
                    "That collection is no longer on the source."
                } else {
                    "The source answered with ${response.status.value}."
                },
            )
        }
        return try {
            response.bodyAsText()
        } catch (error: IOException) {
            throw OnlineTransportException(
                com.pejvak.app.domain.online.OnlineErrorCode.Offline,
                "Could not read the source's answer.",
                error,
            )
        }
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS: Long = 20_000
    }
}

class OnlineTransportException(
    val code: com.pejvak.app.domain.online.OnlineErrorCode,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)
