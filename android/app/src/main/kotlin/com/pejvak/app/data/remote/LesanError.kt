package com.pejvak.app.data.remote

/**
 * Lesan error vocabulary (mirrors mobile/src/lib/errors.ts). The code is what the
 * UI maps to a friendly sentence; only unauthorized/forbidden/validation may end a
 * restored session — offline/timeout/cancelled say nothing about sign-in state.
 */
enum class LesanErrorCode {
    Offline, Timeout, Cancelled, Unauthorized, Forbidden, Validation, Server, InvalidResponse, Unknown;
}

class LesanException(
    message: String,
    val code: LesanErrorCode,
    val status: Int? = null,
    val details: Any? = null,
) : Exception(message)

/** True when the server rejected the token itself (the only thing that may log out). */
fun LesanException.isAuthRejection(): Boolean =
    code == LesanErrorCode.Unauthorized || code == LesanErrorCode.Forbidden || code == LesanErrorCode.Validation