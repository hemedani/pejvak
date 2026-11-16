package com.pejvak.app.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.auth.AuthRepository
import com.pejvak.app.data.auth.AuthSession
import com.pejvak.app.data.remote.LesanErrorCode
import com.pejvak.app.data.remote.LesanException
import com.pejvak.app.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Auth gate state (mirrors authStore.ts). A saved token opens the app immediately on
 * the cached profile; only a background getMe rejection ends the session. Login and
 * register establish the session and kick a sync.
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val authSession: AuthSession,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    enum class Status { Loading, Authenticated, Unauthenticated }

    data class UiState(
        val status: Status = Status.Loading,
        val user: AuthRepository.AuthUser? = null,
        val error: String? = null,
        val isSubmitting: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** True once [restore] has decided the launch state; before that a null token is not a logout. */
    private var restored = false

    init {
        restore()
        // A sign-out can also be started elsewhere (the account screen); the shared
        // token is the single source of truth, so the gate follows it.
        viewModelScope.launch {
            authSession.token.collect { token ->
                if (!restored) return@collect
                if (token == null && _state.value.status == Status.Authenticated) {
                    _state.update { it.copy(status = Status.Unauthenticated, user = null) }
                }
            }
        }
    }

    fun restore() {
        viewModelScope.launch {
            val cached = authRepository.restore(
                onIdentity = { user -> _state.update { it.copy(user = user) } },
                onSignedOut = { _state.update { it.copy(status = Status.Unauthenticated, user = null) } },
            )
            val signedIn = authSession.current() != null
            restored = true
            _state.update {
                it.copy(
                    status = if (signedIn) Status.Authenticated else Status.Unauthenticated,
                    user = cached,
                )
            }
            if (signedIn) {
                syncScheduler.schedulePeriodic()
                syncScheduler.syncNow()
            }
        }
    }

    fun login(email: String, password: String) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val response = authRepository.login(email.trim(), password)
                authRepository.establish(response)
                _state.update { it.copy(status = Status.Authenticated, user = response.user, isSubmitting = false, error = null) }
                syncScheduler.schedulePeriodic()
                syncScheduler.syncNow()
            } catch (error: Exception) {
                _state.update { it.copy(isSubmitting = false, error = toErrorMessage(error)) }
            }
        }
    }

    fun register(username: String, email: String, password: String, displayName: String?) {
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val response = authRepository.register(username.trim(), email.trim(), password, displayName?.trim()?.ifEmpty { null })
                authRepository.establish(response)
                _state.update { it.copy(status = Status.Authenticated, user = response.user, isSubmitting = false, error = null) }
                syncScheduler.schedulePeriodic()
                syncScheduler.syncNow()
            } catch (error: Exception) {
                _state.update { it.copy(isSubmitting = false, error = toErrorMessage(error)) }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            syncScheduler.cancelAll()
            _state.update { it.copy(status = Status.Unauthenticated, user = null, error = null) }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    private fun toErrorMessage(error: Throwable): String = when {
        error is LesanException -> when (error.code) {
            LesanErrorCode.Offline -> "You appear to be offline. Check your connection and try again."
            LesanErrorCode.Timeout -> "The server took too long to respond. Try again."
            LesanErrorCode.Cancelled -> "The request was cancelled. Try again."
            LesanErrorCode.Unauthorized -> "Your session expired. Please sign in again."
            LesanErrorCode.Forbidden -> "You do not have permission to do that."
            LesanErrorCode.Validation -> "Please check the information you entered."
            LesanErrorCode.Server -> "The server ran into a problem. Try again later."
            LesanErrorCode.InvalidResponse -> "The server response could not be read."
            LesanErrorCode.Unknown -> "Something unexpected went wrong."
        }
        !error.message.isNullOrEmpty() -> error.message!!
        else -> "Something unexpected went wrong."
    }
}