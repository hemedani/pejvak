package com.pejvak.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Global sheets mounted above the navigator so they work from inside the player too
 * (DESING.md §10; RN parity: AddToPlaylist / ContextHistory / SessionDetail). Phase 1
 * scaffolds the request types + host; each sheet's real content lands in its feature
 * phase (playlists Phase 8, history Phase 9, annotations Phase 7).
 */
sealed interface SheetRequest {
    data class AddToPlaylist(val trackIds: List<String>, val title: String? = null) : SheetRequest
    data class ContextHistory(val type: String, val key: String, val title: String) : SheetRequest
    data class SessionDetail(val sessionId: String, val noteMode: Boolean = false) : SheetRequest
}

@Composable
fun GlobalSheetHost(request: SheetRequest?, onDismiss: () -> Unit) {
    when (request) {
        is SheetRequest.AddToPlaylist -> GlassSheet(onDismiss = onDismiss, title = "Add to playlist", icon = "playlist") {
            SheetPlaceholder("Playlist picker arrives with the library screens (Phase 8).")
        }
        is SheetRequest.ContextHistory -> GlassSheet(onDismiss = onDismiss, title = request.title, icon = "history") {
            SheetPlaceholder("Collection run history arrives with History (Phase 9).")
        }
        is SheetRequest.SessionDetail -> GlassSheet(
            onDismiss = onDismiss,
            title = if (request.noteMode) "Note" else "Session",
        ) {
            SheetPlaceholder("Session timeline + facts arrive with History (Phase 9).")
        }
        null -> Unit
    }
}

@Composable
private fun SheetPlaceholder(message: String) {
    val tokens = LocalPejvakTokens.current
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = tokens.textSecondary,
        modifier = Modifier.padding(bottom = 24.dp),
    )
}