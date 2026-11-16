package com.pejvak.app.data.remote.online

import com.pejvak.app.domain.online.OnlineSourceException
import java.net.URLEncoder
import kotlin.math.floor
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

private val HTML_TAG = Regex("<[^>]*>")
private val WHITESPACE = Regex("\\s+")

internal fun cleanOnlineText(value: String?): String {
    if (value == null) return ""
    val withoutTags = HTML_TAG.replace(value, " ")
    val decoded = decodeOnlineEntities(withoutTags)
    return WHITESPACE.replace(decoded, " ").trim()
}

internal fun decodeOnlineEntities(value: String): String = value
    .replace(Regex("&#0?39;|&apos;|&#8217;"), "'")
    .replace(Regex("&#0?34;|&quot;|&#8220;|&#8221;"), "\"")
    .replace(Regex("&#0?38;|&amp;"), "&")
    .replace("&#8211;", "–")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&nbsp;", " ")

internal fun encodeQueryComponent(value: String): String =
    URLEncoder.encode(value, "UTF-8")
        .replace("+", "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")

internal fun formEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

internal fun JsonElement?.jsonText(): String? = when (this) {
    null, JsonNull -> null
    is JsonPrimitive -> content
    else -> null
}

internal fun JsonElement?.jsonString(): String? = when (this) {
    null, JsonNull -> null
    is JsonPrimitive -> if (isString) content else null
    is JsonArray -> firstOrNull { it is JsonPrimitive && it.isString && it.content.trim().isNotEmpty() }
        ?.let { (it as JsonPrimitive).content }
    else -> null
}

internal fun JsonElement?.cleanJsonText(): String? =
    cleanOnlineText(jsonString()).takeIf { it.isNotEmpty() }

internal fun JsonElement?.jsonInt(): Int? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive is JsonNull || primitive.isString) return null
    val number = primitive.content.trim().toDoubleOrNull() ?: return null
    if (!number.isFinite() || number != floor(number)) return null
    return number.toInt()
}

internal fun JsonElement?.jsonBoolean(): Boolean? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive is JsonNull) return null
    if (primitive.isString) {
        return when (primitive.content.lowercase()) {
            "true" -> true
            "false" -> false
            else -> null
        }
    }
    return primitive.content.toBooleanStrictOrNull()
}

internal fun JsonElement?.roundedPositiveNumber(): Int {
    val primitive = this as? JsonPrimitive ?: return 0
    if (primitive is JsonNull || primitive.isString) return 0
    val number = primitive.content.toDoubleOrNull() ?: return 0
    if (!number.isFinite() || number <= 0) return 0
    return Math.round(number).toInt()
}

internal suspend fun <T> onlineGuard(block: suspend () -> T): T =
    try {
        block()
    } catch (error: OnlineTransportException) {
        throw OnlineSourceException(
            error.message ?: "The source did not answer.",
            error.code,
            error,
        )
    }
