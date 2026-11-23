package com.pejvak.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.data.auth.AuthRepository
import com.pejvak.app.domain.describeLastSync
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The **account + sync sheet** (AUTH-12), opened from the home button once signed in. It reassures
 * the listener that their data is on the server: identity, what is still queued, when it last
 * synced, *Sync now*, a jump to Settings, and *Sign out*. Empty/zero facts are hidden rather than
 * shown as placeholders.
 */
@Composable
fun AccountSheet(
    onDismiss: () -> Unit,
    shared: AuthViewModel,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by shared.state.collectAsStateWithLifecycle()
    var confirmSignOut by rememberSaveable { mutableStateOf(false) }

    GlassSheet(
        onDismiss = onDismiss,
        modifier = modifier,
        title = stringResource(R.string.account_title),
        subtitle = stringResource(R.string.account_subtitle),
        icon = if (state.pendingTotal > 0) "cloud_upload" else "cloud_done",
    ) {
        // Identity.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(
                modifier = Modifier
                    .size(geo.tiles.lg)
                    .clip(CircleShape)
                    .background(tokens.accentTeal.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = initialOf(state.user),
                    style = MaterialTheme.typography.titleLarge,
                    color = tokens.accentTeal,
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = displayName(state.user) ?: stringResource(R.string.settings_signed_in),
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                state.user?.email?.takeIf { it.isNotBlank() }?.let { email ->
                    Text(
                        text = email,
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Spacer(Modifier.height(geo.spacing.lg))

        // Queue + last-synced (never a placeholder for absent state).
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
                Text(
                    text = if (state.pendingTotal > 0) {
                        if (state.pendingTotal == 1) {
                            stringResource(R.string.account_queued_one, state.pendingTotal)
                        } else {
                            stringResource(R.string.account_queued_many, state.pendingTotal)
                        }
                    } else {
                        stringResource(R.string.account_up_to_date)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (state.pendingTotal > 0) tokens.accentTeal else tokens.text,
                )
                state.lastSyncAt?.takeIf { it > 0 }?.let { at ->
                    Text(
                        text = stringResource(R.string.account_last_synced, describeLastSync(at, System.currentTimeMillis())),
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                    )
                }
            }
        }

        Spacer(Modifier.height(geo.spacing.md))

        PrimaryButton(
            label = stringResource(R.string.account_sync_action),
            loading = state.isSyncing,
            onClick = { shared.syncNow() },
        )

        Spacer(Modifier.height(geo.spacing.md))

        // Manage in Settings.
        GlassCard(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    onDismiss()
                    onOpenSettings()
                },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
            ) {
                PejvakIcon("settings", null, tint = tokens.textSecondary, size = geo.icons.md)
                Text(
                    text = stringResource(R.string.account_manage),
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Sign out.
        TextButton(onClick = { confirmSignOut = true }) {
            Text(
                text = stringResource(R.string.account_sign_out),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.danger,
            )
        }
        Spacer(Modifier.height(geo.spacing.md))
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            containerColor = tokens.canvasBase,
            titleContentColor = tokens.text,
            textContentColor = tokens.textSecondary,
            title = { Text(stringResource(R.string.settings_sign_out_confirm_title)) },
            text = { Text(stringResource(R.string.account_sign_out_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    shared.logout()
                    onDismiss()
                }) {
                    Text(stringResource(R.string.settings_sign_out), color = tokens.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) {
                    Text(stringResource(R.string.account_cancel), color = tokens.text)
                }
            },
        )
    }
}

private fun displayName(user: AuthRepository.AuthUser?): String? =
    user?.displayName?.takeIf { it.isNotBlank() }
        ?: user?.username?.takeIf { it.isNotBlank() }
        ?: user?.email?.takeIf { it.isNotBlank() }

private fun initialOf(user: AuthRepository.AuthUser?): String {
    val name = displayName(user) ?: return "?"
    return name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
}
