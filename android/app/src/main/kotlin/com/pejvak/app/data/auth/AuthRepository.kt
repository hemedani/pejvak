package com.pejvak.app.data.auth

import com.pejvak.app.data.local.SettingsDao
import com.pejvak.app.data.local.SettingsEntity
import com.pejvak.app.data.remote.LesanClient
import com.pejvak.app.data.remote.LesanException
import com.pejvak.app.data.remote.isAuthRejection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Auth against the Lesan backend (mirrors AuthService.ts + authStore.ts). A saved
 * token is proof of a previous sign-in: restore opens the app on it and the cached
 * profile without asking the server; only a background getMe rejection may end the
 * session. Offline/timeout never log the listener out.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val lesan: LesanClient,
    private val tokenStore: SecureTokenStore,
    private val session: AuthSession,
    private val settingsDao: SettingsDao,
    private val json: Json,
) {
    @Serializable
    data class AuthUser(
        val id: String? = null,
        val username: String,
        val email: String,
        val displayName: String? = null,
        val avatarUrl: String? = null,
    )

    data class AuthResponse(val token: String, val user: AuthUser)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val userProjection = buildJsonObject {
        put("_id", 1); put("username", 1); put("email", 1); put("displayName", 1); put("avatarUrl", 1)
    }

    suspend fun login(email: String, password: String): AuthResponse {
        val set = buildJsonObject { put("email", email); put("password", password) }
        val get = buildJsonObject { put("token", 1); put("user", userProjection) }
        val body = lesan.callBody("user", "login", set, get)
        return parseAuthResponse(body)
    }

    suspend fun register(username: String, email: String, password: String, displayName: String?): AuthResponse {
        val set = buildJsonObject {
            put("username", username); put("email", email); put("password", password)
            if (!displayName.isNullOrBlank()) put("displayName", displayName)
        }
        val get = buildJsonObject { put("token", 1); put("user", userProjection) }
        val body = lesan.callBody("user", "register", set, get)
        return parseAuthResponse(body)
    }

    suspend fun getMe(): AuthUser {
        val get = buildJsonObject {
            put("_id", 1); put("username", 1); put("email", 1); put("displayName", 1)
            put("avatarUrl", 1); put("createdAt", 1); put("updatedAt", 1)
        }
        val body = lesan.callBody("user", "getMe", buildJsonObject {}, get, token = session.current())
        return parseUser(body.jsonObject)
    }

    /** Persists a successful sign-in: durable token + in-memory session + cached profile. */
    suspend fun establish(response: AuthResponse) {
        tokenStore.setToken(response.token)
        session.set(response.token)
        cacheUser(response.user)
    }

    /**
     * Restores a saved session. Returns the cached user immediately (or null when
     * there is no token). A background getMe refreshes the identity and is the only
     * thing allowed to end the session. [onIdentity] reports the refreshed user or a
     * sign-out.
     */
    suspend fun restore(onIdentity: (AuthUser?) -> Unit, onSignedOut: () -> Unit): AuthUser? {
        val token = tokenStore.getToken()
        if (token.isNullOrEmpty()) {
            session.set(null)
            return null
        }
        session.set(token)
        val cached = getCachedUser()
        scope.launch {
            try {
                val user = getMe()
                if (session.current() != token) return@launch
                cacheUser(user)
                onIdentity(user)
            } catch (error: Exception) {
                if (error !is LesanException || !error.isAuthRejection()) return@launch
                if (session.current() != token) return@launch
                tokenStore.clearToken()
                clearCachedUser()
                session.set(null)
                onSignedOut()
            }
        }
        return cached
    }

    suspend fun logout() {
        tokenStore.clearToken()
        clearCachedUser()
        session.set(null)
    }

    suspend fun getCachedUser(): AuthUser? {
        val raw = settingsDao.get(CACHED_USER_KEY) ?: return null
        if (raw.isEmpty()) return null
        return try {
            json.decodeFromString(AuthUser.serializer(), raw)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun cacheUser(user: AuthUser) {
        settingsDao.put(SettingsEntity(CACHED_USER_KEY, json.encodeToString(AuthUser.serializer(), user)))
    }

    suspend fun clearCachedUser() {
        settingsDao.put(SettingsEntity(CACHED_USER_KEY, ""))
    }

    private fun parseAuthResponse(body: kotlinx.serialization.json.JsonElement): AuthResponse {
        val obj = body.jsonObject
        val token = obj["token"]?.jsonPrimitive?.content
            ?: throw LesanException("Invalid auth response.", com.pejvak.app.data.remote.LesanErrorCode.InvalidResponse)
        val user = parseUser(obj["user"]?.jsonObject ?: JsonObject(emptyMap()))
        return AuthResponse(token, user)
    }

    private fun parseUser(obj: JsonObject): AuthUser = AuthUser(
        id = obj["_id"]?.jsonPrimitive?.contentOrNull,
        username = obj["username"]?.jsonPrimitive?.contentOrNull ?: "",
        email = obj["email"]?.jsonPrimitive?.contentOrNull ?: "",
        displayName = obj["displayName"]?.jsonPrimitive?.contentOrNull,
        avatarUrl = obj["avatarUrl"]?.jsonPrimitive?.contentOrNull,
    )

    companion object {
        private const val CACHED_USER_KEY = "auth.cachedUser"
    }
}