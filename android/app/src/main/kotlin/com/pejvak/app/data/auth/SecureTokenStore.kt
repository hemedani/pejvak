package com.pejvak.app.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The JWT in Keystore-backed encrypted storage (mirrors secureStore.ts). The token
 * is the only secret; the cached profile lives beside it in plain settings KV.
 */
@Suppress("DEPRECATION")
@Singleton
class SecureTokenStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "pejvak_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun getToken(): String? = try {
        prefs.getString(TOKEN_KEY, null)
    } catch (_: Exception) {
        null
    }

    fun setToken(token: String) {
        try {
            prefs.edit().putString(TOKEN_KEY, token).apply()
        } catch (_: Exception) {
            // A keystore failure must not crash sign-in; the session stays in memory.
        }
    }

    fun clearToken() {
        try {
            prefs.edit().remove(TOKEN_KEY).apply()
        } catch (_: Exception) {
        }
    }

    companion object {
        private const val TOKEN_KEY = "pejvak.auth.token"
    }
}