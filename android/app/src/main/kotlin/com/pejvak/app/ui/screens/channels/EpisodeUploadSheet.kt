package com.pejvak.app.ui.screens.channels

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.WaveProgressBar
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * The upload flow (plan 07 CHAN-C04): pick an audio file (SAF), then the repository
 * device-hashes it, reads its duration, streams the bytes to the multipart
 * `uploadChannelMedia` act (progress on the app's own [WaveProgressBar], not a Material
 * bar — prompt D6), and `publishChannelAudio` with the durable URL + device identity.
 * Over the storage quota the act refuses and the reason shows as a non-blocking notice.
 */
@Composable
fun EpisodeUploadSheet(
    viewModel: ChannelManageViewModel,
    folders: List<ChannelPlaylist>,
    onDismiss: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current

    var pickedUri by remember { mutableStateOf<String?>(null) }
    var fileName by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf(EpisodeDraft()) }
    var selectedFolder by remember { mutableStateOf(folders.firstOrNull()?.serverId) }
    var progress by remember { mutableFloatStateOf(-1f) }
    var hadBusy by remember { mutableStateOf(false) }

    // Success = the write ran (busy true) then finished (busy false) with no refusal → close.
    LaunchedEffect(state.busy, state.notice) {
        if (state.busy) hadBusy = true
        if (hadBusy && !state.busy && state.notice == null) onDismiss()
    }

    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            pickedUri = uri.toString()
            fileName = uri.lastPathSegment ?: uri.toString()
            if (draft.title.isBlank()) {
                draft = draft.copy(title = fileName?.substringBeforeLast('.')?.takeIf { it.isNotBlank() }.orEmpty())
            }
        }
    }

    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.upload_title),
        subtitle = fileName ?: stringResource(R.string.upload_pick_hint),
        icon = "cloud_upload",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            if (state.notice != null) {
                InlineNotice(message = state.notice!!, tone = NoticeTone.Warning, title = stringResource(R.string.channel_notice_title))
            }

            GlassChip(
                label = stringResource(if (fileName == null) R.string.upload_pick else R.string.upload_repick),
                icon = "cloud_upload",
                selected = fileName != null,
                onClick = { audioPicker.launch(arrayOf("audio/*")) },
            )
            if (progress >= 0f) {
                WaveProgressBar(fraction = progress, modifier = Modifier.fillMaxWidth())
            }

            if (folders.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    Text(stringResource(R.string.upload_folder), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                    ) {
                        folders.forEach { folder ->
                            GlassChip(
                                label = folder.title,
                                icon = "folder",
                                selected = selectedFolder == folder.serverId,
                                frosted = true,
                                onClick = { selectedFolder = folder.serverId },
                            )
                        }
                    }
                }
            } else {
                InlineNotice(message = stringResource(R.string.upload_needs_folder), tone = NoticeTone.Info)
            }

            TextField(
                value = draft.title,
                onValueChange = { v -> draft = draft.copy(title = v) },
                label = stringResource(R.string.upload_title_field),
            )
            TextField(
                value = draft.category,
                onValueChange = { v -> draft = draft.copy(category = v) },
                label = stringResource(R.string.upload_category),
            )
            TagInput(tags = draft.tags, onTagsChange = { list -> draft = draft.copy(tags = list) }, label = stringResource(R.string.upload_tags))
            TextField(
                value = draft.description,
                onValueChange = { v -> draft = draft.copy(description = v) },
                label = stringResource(R.string.upload_description),
                singleLine = false,
                minLines = 2,
                maxLines = 4,
            )
            TextField(value = draft.author, onValueChange = { v -> draft = draft.copy(author = v) }, label = stringResource(R.string.upload_author))
            TextField(value = draft.narrator, onValueChange = { v -> draft = draft.copy(narrator = v) }, label = stringResource(R.string.upload_narrator))
            GlassChip(
                label = stringResource(R.string.upload_audiobook),
                icon = "music",
                selected = draft.isAudiobook,
                frosted = true,
                onClick = { draft = draft.copy(isAudiobook = !draft.isAudiobook) },
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("cloud_upload"),
                    contentDescription = stringResource(R.string.upload_publish),
                    enabled = pickedUri != null && selectedFolder != null && draft.isValid && !state.busy,
                    onClick = {
                        val folder = selectedFolder ?: return@BubbleButton
                        val uri = pickedUri ?: return@BubbleButton
                        progress = 0f
                        viewModel.uploadEpisode(folder, uri, draft) { p ->
                            progress = if (p.total > 0) (p.sent.toFloat() / p.total).coerceIn(0f, 1f) else progress
                        }
                    },
                )
            }
        }
    }
}
