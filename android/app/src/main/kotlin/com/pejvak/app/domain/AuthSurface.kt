package com.pejvak.app.domain

/**
 * Pure logic for the home-screen auth surface (SRV-02/03, AUTH-13). No Android imports, so the
 * migration predicate and the button mapping are unit-testable and the screen stays a layout.
 */

/**
 * Whether the device owes a one-time full re-queue because the configured Lesan endpoint changed.
 *
 * The sync engine only pushes `pending`/`failed` rows, so rows already marked `synced` against an
 * old server would never reach a new one. When the base URL differs from the last one we recorded
 * (including the very first run, where nothing is recorded yet), we re-queue everything once. The
 * backend is idempotent on `clientId`, so this is safe whether the new server is empty or not.
 */
fun endpointNeedsMigration(storedEndpoint: String?, currentEndpoint: String): Boolean {
    val current = currentEndpoint.trim().trimEnd('/')
    if (current.isEmpty()) return false
    val stored = storedEndpoint?.trim()?.trimEnd('/')
    return stored != current
}

/** The state the home-screen auth button conveys, derived from session + queue only. */
enum class AccountButtonState {
    /** No valid session: invite the listener to register or sign in. */
    NeedsSignIn,

    /** Signed in with rows still owed to the server. */
    Queued,

    /** Signed in and everything local is acknowledged by the server. */
    UpToDate,
}

fun accountButtonState(signedIn: Boolean, pendingTotal: Int): AccountButtonState = when {
    !signedIn -> AccountButtonState.NeedsSignIn
    pendingTotal > 0 -> AccountButtonState.Queued
    else -> AccountButtonState.UpToDate
}

/** The semantic glyph key for [AccountButtonState] (resolved through ICON_GLYPHS by the UI). */
fun AccountButtonState.glyphKey(): String = when (this) {
    AccountButtonState.NeedsSignIn -> "person_add"
    AccountButtonState.Queued -> "cloud_upload"
    AccountButtonState.UpToDate -> "cloud_done"
}

/** An attention dot is warranted on anything but the fully-acknowledged state. */
fun AccountButtonState.needsAttention(): Boolean = this != AccountButtonState.UpToDate
