package com.pejvak.app.ui.screens.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.ChannelPlaylist
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.PlaylistDraft
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.RowAction
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The channel management hub (plan 07 CHAN-C03/C04/C05/C06): folders (add/rename/reorder/
 * delete), episodes (upload, edit, move, delete), and the leaf-first channel delete. Reached
 * only for an owned channel; destructive actions confirm, refusals surface as notices.
 */
@Composable
fun ChannelManageScreen(
    onBack: () -> Unit,
    viewModel: ChannelManageViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current

    var folderEditor by remember { mutableStateOf<Pair<PlaylistDraft?, String?>?>(null) } // null=closed; non-null Pair=(existing draft?, editing id?)
    var uploadOpen by remember { mutableStateOf(false) }
    var episodeEditor by remember { mutableStateOf<Pair<EpisodeDraft?, String?>>(null to null) }
    var moveTarget by remember { mutableStateOf<ChannelAudio?>(null) }
    var confirmDeleteChannel by remember { mutableStateOf(false) }
    var confirmDeleteFolder by remember { mutableStateOf<String?>(null) }
    var confirmDeleteEpisode by remember { mutableStateOf<String?>(null) }

    val folders = state.folders.sortedBy { it.sortOrder }
    val episodes = state.episodes.sortedWith(compareBy({ it.playlistServerId ?: "" }, { it.position }, { it.serverId }))

    // Close the manage screen once the channel is gone.
    androidx.compose.runtime.LaunchedEffect(state.deleted) { if (state.deleted) onBack() }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = state.channel?.name ?: stringResource(R.string.channel_loading),
                subtitle = stringResource(R.string.channel_manage_subtitle),
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("cloud_upload"),
                        contentDescription = stringResource(R.string.upload_title),
                        onClick = { uploadOpen = true },
                    )
                },
            )
        },
    ) { topInset ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = geo.spacing.lg,
                end = geo.spacing.lg,
                top = topInset,
                bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
            ),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            if (state.notice != null) {
                item {
                    InlineNotice(
                        message = state.notice!!,
                        tone = NoticeTone.Warning,
                        title = stringResource(R.string.channel_notice_title),
                        action = { TextButton(onClick = viewModel::dismissNotice) { Text(stringResource(R.string.action_close)) } },
                    )
                }
            }

            item { SectionLabel(stringResource(R.string.channel_manage_folders)) }
            itemsIndexed(folders, key = { _, f -> f.serverId }) { index, folder ->
                ListGroup(items = listOf(folder)) { _, _ ->
                    ListRow(
                        title = folder.title,
                        subtitle = folder.category?.replaceFirstChar { it.uppercase() },
                        meta = stringResource(R.string.channel_episodes, folder.audioCount),
                        leading = { PaletteTile(contentHash = folder.serverId, label = folder.title, size = geo.tiles.sm) },
                        actions = listOf(
                            RowAction("up", "chevronUp", stringResource(R.string.folder_move_up), priority = 1, onClick = { viewModel.moveFolder(folder.serverId, up = true) }),
                            RowAction("down", "chevronDown", stringResource(R.string.folder_move_down), priority = 2, onClick = { viewModel.moveFolder(folder.serverId, up = false) }),
                            RowAction("rename", "edit", stringResource(R.string.folder_rename), priority = 3, onClick = { folderEditor = folder.toDraft() to folder.serverId }),
                            RowAction("delete", "trash", stringResource(R.string.action_delete), priority = 9, menuOnly = true, destructive = true, onClick = { confirmDeleteFolder = folder.serverId }),
                        ),
                    )
                }
            }
            item {
                // Non-frosted: inside the ScreenFrame backdrop source (see the cycle rule).
                GlassChip(
                    label = stringResource(R.string.folder_add),
                    icon = "add",
                    onClick = { folderEditor = null to null },
                )
            }

            item { SectionLabel(stringResource(R.string.channel_manage_episodes)) }
            if (episodes.isEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.channel_manage_no_episodes),
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.textSecondary,
                        modifier = Modifier.padding(vertical = geo.spacing.sm),
                    )
                }
            } else {
                itemsIndexed(episodes, key = { _, a -> a.serverId }) { _, audio ->
                    ListGroup(items = listOf(audio)) { _, _ ->
                        ListRow(
                            title = audio.title,
                            subtitle = folders.firstOrNull { it.serverId == audio.playlistServerId }?.title,
                            meta = audio.durationSec.takeIf { it > 0 }?.let { "$it s" },
                            leading = { PaletteTile(contentHash = audio.contentHash, label = audio.title, artworkUrl = audio.artworkUrl, size = geo.tiles.sm) },
                            actions = listOf(
                                RowAction("edit", "edit", stringResource(R.string.episode_edit), priority = 1, onClick = { episodeEditor = audio.toDraft() to audio.serverId }),
                                RowAction("move", "list", stringResource(R.string.episode_move), priority = 2, onClick = { moveTarget = audio }),
                                RowAction("delete", "trash", stringResource(R.string.action_delete), priority = 9, menuOnly = true, destructive = true, onClick = { confirmDeleteEpisode = audio.serverId }),
                            ),
                        )
                    }
                }
            }

            item { SectionLabel(stringResource(R.string.channel_manage_danger)) }
            item {
                ListGroup(items = listOf(Unit)) { _, _ ->
                    ListRow(
                        title = stringResource(R.string.channel_manage_delete),
                        meta = stringResource(R.string.channel_manage_delete_body),
                        leading = { PaletteTile(contentHash = "danger", label = "!", size = geo.tiles.sm) },
                        actions = listOf(
                            RowAction("delete", "trash", stringResource(R.string.channel_manage_delete), priority = 0, onClick = { confirmDeleteChannel = true }),
                        ),
                    )
                }
            }
        }
    }

    // --- sheets & dialogs ---
    folderEditor?.let { (folderDraft, folderEditingId) ->
        PlaylistEditorSheet(
            existing = folderDraft,
            busy = state.busy,
            onDismiss = { folderEditor = null },
            onSubmit = { draft ->
                if (folderEditingId == null) viewModel.addFolder(draft) else viewModel.renameFolder(folderEditingId, draft)
                folderEditor = null
            },
        )
    }

    if (uploadOpen) {
        EpisodeUploadSheet(
            viewModel = viewModel,
            folders = folders,
            onDismiss = { uploadOpen = false },
        )
    }

    if (episodeEditor.first != null) {
        val (epDraft, epId) = episodeEditor
        EpisodeEditorSheet(
            initial = epDraft!!,
            busy = state.busy,
            onDismiss = { episodeEditor = null to null },
            onSubmit = { draft ->
                if (epId != null) viewModel.editEpisode(epId, draft)
                episodeEditor = null to null
            },
        )
    }

    val moving = moveTarget
    if (moving != null) {
        EpisodeMoveSheet(
            folders = folders.filterNot { it.serverId == moving.playlistServerId },
            onDismiss = { moveTarget = null },
            onMove = { targetId ->
                viewModel.moveEpisode(moving.serverId, targetId)
                moveTarget = null
            },
        )
    }

    if (confirmDeleteFolder != null) {
        ConfirmDialog(
            title = stringResource(R.string.folder_delete_title),
            body = stringResource(R.string.folder_delete_body),
            onConfirm = { confirmDeleteFolder?.let { viewModel.deleteFolder(it) } ; confirmDeleteFolder = null },
            onDismiss = { confirmDeleteFolder = null },
        )
    }
    if (confirmDeleteEpisode != null) {
        ConfirmDialog(
            title = stringResource(R.string.episode_delete_title),
            body = stringResource(R.string.episode_delete_body),
            onConfirm = { confirmDeleteEpisode?.let { viewModel.deleteEpisode(it) } ; confirmDeleteEpisode = null },
            onDismiss = { confirmDeleteEpisode = null },
        )
    }
    if (confirmDeleteChannel) {
        ConfirmDialog(
            title = stringResource(R.string.channel_manage_delete),
            body = stringResource(R.string.channel_manage_delete_body),
            onConfirm = { confirmDeleteChannel = false; viewModel.deleteChannel() },
            onDismiss = { confirmDeleteChannel = false },
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = tokens.textSecondary,
        modifier = Modifier.padding(top = geo.spacing.md, start = geo.spacing.xs),
    )
}

@Composable
private fun ConfirmDialog(title: String, body: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(stringResource(R.string.action_delete)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

@Composable
private fun EpisodeMoveSheet(folders: List<ChannelPlaylist>, onDismiss: () -> Unit, onMove: (String) -> Unit) {
    GlassSheet(onDismiss = onDismiss, title = stringResource(R.string.episode_move), icon = "folder") {
        Column(
            modifier = Modifier.fillMaxWidth().padding(bottom = LocalPejvakGeometry.current.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.sm),
        ) {
            if (folders.isEmpty()) {
                Text(stringResource(R.string.episode_move_none), style = MaterialTheme.typography.bodyMedium)
            } else {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(LocalPejvakGeometry.current.spacing.sm),
                ) {
                    folders.forEach { folder ->
                        GlassChip(label = folder.title, icon = "folder", selected = true, onClick = { onMove(folder.serverId) })
                    }
                }
            }
        }
    }
}

private fun ChannelPlaylist.toDraft() = PlaylistDraft(
    title = title,
    category = category.orEmpty(),
    description = description.orEmpty(),
    tags = tags,
    sortOrder = sortOrder,
)

private fun ChannelAudio.toDraft() = EpisodeDraft(
    title = title,
    category = category.orEmpty(),
    tags = tags,
    description = description.orEmpty(),
    author = author.orEmpty(),
    narrator = narrator.orEmpty(),
    isAudiobook = isAudiobook,
    languageCode = languageCode,
    artworkUrl = artworkUrl,
    position = position,
)
