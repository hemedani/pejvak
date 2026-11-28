package com.pejvak.app.ui.screens.channels

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.CHANNEL_CATEGORIES
import com.pejvak.app.domain.channel.categoryLabel
import com.pejvak.app.domain.online.LANGUAGES
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.WaveProgressBar
import com.pejvak.app.ui.components.field.SelectField
import com.pejvak.app.ui.components.field.SelectOption
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * The upload page (plan 08 UX-C02, overhauled by plan 09 UX-04): pick audio (SAF) → device
 * hash/duration → progress on the app's own [WaveProgressBar] → publish into a chosen folder with
 * a category, language, order and the episode text. Every enumerated input is a [SelectField]
 * (folder / category / language), not a free-text box. A full-screen route so a swipe-back cannot
 * discard the draft.
 *
 * **No `frosted` chip lives here.** This body is the `ScreenFrame` backdrop source; a frosted chip
 * inside it samples itself and crashes the RenderThread (AGENTS §Frosting / summary §5g / BUG-01).
 */
@Composable
fun ChannelUploadScreen(
    onBack: () -> Unit,
    viewModel: ChannelUploadViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current

    LaunchedEffect(state.published) { if (state.published) onBack() }

    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.pickFile(uri.toString(), uri.lastPathSegment ?: uri.toString())
    }

    val folderOptions = state.folders.map { folder ->
        SelectOption(
            value = folder.serverId,
            label = folder.title,
            subtitle = if (folder.audioCount > 0) stringResource(R.string.channel_episodes, folder.audioCount) else stringResource(R.string.upload_folder_empty),
        )
    }
    val categoryOptions = CHANNEL_CATEGORIES.map { SelectOption(it, categoryLabel(it)) }
    val languageOptions = LANGUAGES.map { SelectOption(it.code, "${it.nativeName} · ${it.name}", it.code) }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.upload_title),
                subtitle = state.fileName ?: stringResource(R.string.upload_pick_hint),
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
                        contentDescription = stringResource(R.string.upload_publish),
                        enabled = state.canPublish,
                        onClick = viewModel::publish,
                    )
                },
            )
        },
    ) { topInset ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(top = topInset)
                .padding(horizontal = geo.spacing.lg)
                .padding(bottom = LocalShellInsets.current.bottom + geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            if (state.notice != null) {
                InlineNotice(
                    message = state.notice!!,
                    tone = NoticeTone.Warning,
                    title = stringResource(R.string.channel_notice_title),
                    action = { TextButton(onClick = viewModel::dismissNotice) { Text(stringResource(R.string.action_close)) } },
                )
            }

            if (state.folders.isEmpty() && !state.loading) {
                EmptyState(
                    icon = "folder",
                    title = stringResource(R.string.upload_needs_folder),
                    body = stringResource(R.string.upload_needs_folder_body),
                )
            } else {
                // 1. The file.
                GlassChip(
                    label = stringResource(if (state.fileName == null) R.string.upload_pick else R.string.upload_repick),
                    icon = "cloud_upload",
                    selected = state.fileName != null,
                    onClick = { audioPicker.launch(arrayOf("audio/*")) },
                )
                if (state.progress >= 0f) {
                    WaveProgressBar(fraction = state.progress, modifier = Modifier.fillMaxWidth())
                }

                // 2. Where it goes — folder + order (explicit, plan 09 UX-04b/c).
                SelectField(
                    label = stringResource(R.string.upload_folder),
                    selected = state.selectedFolder,
                    options = folderOptions,
                    onSelect = viewModel::selectFolder,
                    placeholder = stringResource(R.string.upload_folder_placeholder),
                    leadingIcon = "folder",
                    sheetTitle = stringResource(R.string.upload_folder),
                )
                TextField(
                    value = state.positionInput,
                    onValueChange = viewModel::setPosition,
                    label = stringResource(R.string.upload_order),
                    placeholder = stringResource(R.string.upload_order_placeholder),
                    keyboardType = KeyboardType.Number,
                    error = state.positionError,
                )

                // 3. What it is — title + category + language (select boxes, plan 09 UX-04d).
                TextField(
                    value = state.draft.title,
                    onValueChange = { v -> viewModel.update { it.copy(title = v) } },
                    label = stringResource(R.string.upload_title_field),
                )
                SelectField(
                    label = stringResource(R.string.upload_category),
                    selected = state.draft.category.takeIf { it.isNotBlank() },
                    options = categoryOptions,
                    onSelect = { v -> viewModel.update { it.copy(category = v) } },
                    placeholder = stringResource(R.string.upload_category_placeholder),
                    leadingIcon = "tag",
                    sheetTitle = stringResource(R.string.upload_category),
                    rawSelectedLabel = state.draft.category.takeIf { it.isNotBlank() }?.let { categoryLabel(it) },
                )
                SelectField(
                    label = stringResource(R.string.upload_language),
                    selected = state.draft.languageCode,
                    options = languageOptions,
                    onSelect = { v -> viewModel.update { it.copy(languageCode = v) } },
                    placeholder = stringResource(R.string.upload_language_placeholder),
                    leadingIcon = "language",
                    sheetTitle = stringResource(R.string.upload_language),
                )

                TextField(
                    value = state.tagsInput,
                    onValueChange = viewModel::setTagsInput,
                    label = stringResource(R.string.upload_tags),
                    placeholder = stringResource(R.string.upload_tags_hint),
                )
                if (state.draft.tags.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                        state.draft.tags.forEach { GlassChip(label = it, icon = "tag", selected = true) }
                    }
                }
                TextField(
                    value = state.draft.description,
                    onValueChange = { v -> viewModel.update { it.copy(description = v) } },
                    label = stringResource(R.string.upload_description),
                    singleLine = false,
                    minLines = 2,
                    maxLines = 4,
                )
                TextField(value = state.draft.author, onValueChange = { v -> viewModel.update { it.copy(author = v) } }, label = stringResource(R.string.upload_author))
                TextField(value = state.draft.narrator, onValueChange = { v -> viewModel.update { it.copy(narrator = v) } }, label = stringResource(R.string.upload_narrator))
                GlassChip(
                    label = stringResource(R.string.upload_audiobook),
                    icon = "music",
                    selected = state.draft.isAudiobook,
                    onClick = { viewModel.update { it.copy(isAudiobook = !it.isAudiobook) } },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onBack) { Text(stringResource(R.string.action_cancel)) }
                    TextButton(
                        onClick = viewModel::publish,
                        enabled = state.canPublish,
                    ) {
                        Text(stringResource(R.string.upload_publish), color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}
