package com.pejvak.app.data.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The in-memory auth token (mirrors client.ts `setAuthToken`). Set on restore/login,
 * cleared on logout. The sync transport reads it for every request; the secure store
 * is the durable copy.
 */
@Singleton
class AuthSession @Inject constructor() {
    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    fun current(): String? = _token.value
    fun set(token: String?) { _token.value = token }
}