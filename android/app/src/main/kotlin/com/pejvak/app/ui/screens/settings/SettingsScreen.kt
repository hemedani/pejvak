package com.pejvak.app.ui.screens.settings

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.BuildConfig
import com.pejvak.app.R
import com.pejvak.app.core.CrashLog
import com.pejvak.app.domain.MotionPreference
import com.pejvak.app.domain.SPEED_OPTIONS
import com.pejvak.app.domain.ThemePreference
import com.pejvak.app.domain.describeHistoryQuota
import com.pejvak.app.domain.describeLastSync
import com.pejvak.app.domain.describePendingQueue
import com.pejvak.app.domain.formatBytes
import com.pejvak.app.domain.formatSpeed
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.CardRow
import com.pejvak.app.ui.components.CardSection
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.RowDivider
import com.pejvak.app.ui.components.ScreenHeader
import com.pejvak.app.ui.components.SegmentedControl
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import java.io.File

/**
 * Settings (SE-01..08, SY-10): account, playback speed, appearance, motion and
 * haptics, storage & sync, the notes index, and a debug-only field gallery.
 * Device-only prefs never sync; speed is shared and follows the listener.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenNotes: () -> Unit,
    onOpenGallery: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    val prefs by viewModel.preferences.collectAsStateWithLifecycle()
    var confirmSignOut by remember { mutableStateOf(false) }

    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text(stringResource(R.string.settings_sign_out_confirm_title)) },
            text = { Text(stringResource(R.string.settings_sign_out_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    viewModel.logout()
                }) { Text(stringResource(R.string.settings_sign_out), color = tokens.danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = geo.spacing.xl, vertical = geo.spacing.xl),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.xl),
    ) {
        ScreenHeader(
            overline = stringResource(R.string.settings_overline),
            title = stringResource(R.string.settings_title),
            action = {
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("back"),
                    contentDescription = stringResource(R.string.back),
                    onClick = onBack,
                )
            },
        )

        CardSection(title = stringResource(R.string.settings_account)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(geo.spacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
            ) {
                Box(
                    modifier = Modifier
                        .size(geo.tiles.md)
                        .clip(CircleShape)
                        .background(tokens.glassFill),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initialOf(state.user),
                        style = MaterialTheme.typography.titleLarge,
                        color = tokens.accent,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = displayName(state.user) ?: stringResource(R.string.settings_signed_in),
                        style = MaterialTheme.typography.titleMedium,
                        color = tokens.text,
                    )
                    state.user?.email?.takeIf { it.isNotBlank() }?.let { email ->
                        Text(
                            text = email,
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.textTertiary,
                        )
                    }
                }
            }
        }

        CardSection(
            title = stringResource(R.string.settings_playback),
            footer = stringResource(R.string.settings_playback_footer),
        ) {
            Box(Modifier.fillMaxWidth().padding(geo.spacing.lg)) {
                SegmentedControl(
                    options = SPEED_OPTIONS.map { formatSpeed(it) },
                    selectedIndex = SPEED_OPTIONS.indexOf(prefs.defaultSpeed).coerceAtLeast(0),
                    onSelect = { index -> viewModel.setDefaultSpeed(SPEED_OPTIONS[index]) },
                )
            }
        }

        CardSection(
            title = stringResource(R.string.settings_appearance),
            footer = stringResource(R.string.settings_appearance_footer),
        ) {
            Box(Modifier.fillMaxWidth().padding(geo.spacing.lg)) {
                SegmentedControl(
                    options = listOf(
                        stringResource(R.string.settings_theme_system),
                        stringResource(R.string.settings_theme_light),
                        stringResource(R.string.settings_theme_dark),
                    ),
                    selectedIndex = when (prefs.themePreference) {
                        ThemePreference.System -> 0
                        ThemePreference.Light -> 1
                        ThemePreference.Dark -> 2
                    },
                    onSelect = { index ->
                        viewModel.setTheme(
                            when (index) {
                                1 -> ThemePreference.Light
                                2 -> ThemePreference.Dark
                                else -> ThemePreference.System
                            },
                        )
                    },
                )
            }
        }

        CardSection(
            title = stringResource(R.string.settings_motion),
            footer = stringResource(R.string.settings_motion_footer),
        ) {
            Box(Modifier.fillMaxWidth().padding(geo.spacing.lg)) {
                SegmentedControl(
                    options = listOf(
                        stringResource(R.string.settings_motion_system),
                        stringResource(R.string.settings_motion_full),
                        stringResource(R.string.settings_motion_reduced),
                    ),
                    selectedIndex = when (prefs.motionPreference) {
                        MotionPreference.System -> 0
                        MotionPreference.Full -> 1
                        MotionPreference.Reduced -> 2
                    },
                    onSelect = { index ->
                        viewModel.setMotionPreference(
                            when (index) {
                                1 -> MotionPreference.Full
                                2 -> MotionPreference.Reduced
                                else -> MotionPreference.System
                            },
                        )
                    },
                )
            }
            RowDivider()
            CardRow(
                icon = "sparkle",
                label = stringResource(R.string.settings_haptics),
                detail = stringResource(R.string.settings_haptics_detail),
                trailing = {
                    Switch(
                        checked = prefs.hapticsEnabled,
                        onCheckedChange = { viewModel.setHapticsEnabled(it) },
                    )
                },
            )
        }

        CardSection(
            title = stringResource(R.string.settings_storage_sync),
            footer = describeHistoryQuota(state.quota),
        ) {
            CardRow(
                icon = "library",
                label = stringResource(R.string.settings_imported_audio),
                value = formatBytes(state.storageBytes),
            )
            RowDivider()
            CardRow(
                icon = "sync",
                label = stringResource(R.string.settings_pending_queue),
                value = state.pending.total.toString(),
                detail = describePendingQueue(
                    tracks = state.pending.tracks,
                    sessions = state.pending.sessions,
                    annotations = state.pending.annotations,
                    playlists = state.pending.playlists,
                    contextPlays = state.pending.contextPlays,
                    onlineCollections = state.pending.onlineCollections,
                ),
            )
            RowDivider()
            CardRow(
                icon = "time",
                label = stringResource(R.string.settings_last_synced),
                value = describeLastSync(state.lastSyncAt, System.currentTimeMillis()),
            )
            RowDivider()
            Box(Modifier.fillMaxWidth().padding(geo.spacing.lg)) {
                PrimaryButton(
                    label = stringResource(R.string.settings_sync_now),
                    loading = state.syncing,
                    onClick = { viewModel.syncNow() },
                )
            }
        }

        CardSection(title = stringResource(R.string.settings_library)) {
            CardRow(
                icon = "notes",
                label = stringResource(R.string.settings_all_notes),
                detail = stringResource(R.string.settings_all_notes_detail),
                onClick = onOpenNotes,
            )
        }

        val context = LocalContext.current
        val crashReport = remember { CrashLog.latest(context) }
        CardSection(
            title = stringResource(R.string.settings_diagnostics),
            footer = stringResource(R.string.settings_diagnostics_footer),
        ) {
            CardRow(
                icon = "share",
                label = stringResource(R.string.settings_crash_share),
                detail = if (crashReport != null) {
                    CrashLog.summary(context)
                } else {
                    stringResource(R.string.settings_crash_none)
                },
                onClick = crashReport?.let { file -> { shareCrash(context, file) } },
            )
        }

        if (BuildConfig.DEBUG) {
            CardSection(title = stringResource(R.string.settings_developer)) {
                CardRow(
                    icon = "settings",
                    label = stringResource(R.string.settings_gallery),
                    detail = stringResource(R.string.settings_gallery_detail),
                    onClick = onOpenGallery,
                )
            }
        }

        Button(
            onClick = { confirmSignOut = true },
            enabled = !state.signingOut,
            shape = RoundedCornerShape(geo.radius.pill),
            colors = ButtonDefaults.buttonColors(
                containerColor = tokens.danger,
                contentColor = tokens.onAccent,
            ),
            modifier = Modifier.fillMaxWidth().height(geo.controls.xl),
        ) {
            Text(
                text = stringResource(R.string.settings_sign_out),
                style = MaterialTheme.typography.labelLarge,
            )
        }
        Spacer(Modifier.size(geo.spacing.sm))
    }
}

private fun displayName(user: com.pejvak.app.data.auth.AuthRepository.AuthUser?): String? {
    if (user == null) return null
    return user.displayName?.takeIf { it.isNotBlank() } ?: user.username.takeIf { it.isNotBlank() }
}

/**
 * Hands the last crash to whichever app the owner picks — a messenger, mail, a
 * notes app. The file is the only thing exposed by the app's `FileProvider`, and
 * only for the duration of this grant.
 */
private fun shareCrash(context: Context, file: File) {
    val uri = runCatching {
        FileProvider.getUriForFile(context, "${context.packageName}.crashes", file)
    }.getOrNull() ?: return
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, "Pejvak crash report")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    runCatching { context.startActivity(Intent.createChooser(send, null)) }
}

private fun initialOf(user: com.pejvak.app.data.auth.AuthRepository.AuthUser?): String {
    val name = displayName(user) ?: return "?"
    return name.trim().take(1).uppercase()
}
