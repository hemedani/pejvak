package com.pejvak.app.ui.screens.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.channel.CHANNEL_CATEGORIES
import com.pejvak.app.domain.channel.EpisodeDraft
import com.pejvak.app.domain.channel.categoryLabel
import com.pejvak.app.domain.online.LANGUAGES
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.field.SelectField
import com.pejvak.app.ui.components.field.SelectOption
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * Edit an episode's metadata (plan 07 CHAN-C05). Bytes are fixed; only the text changes.
 * Category and language are [SelectField]s so the edit form matches the upload page (plan 09 UX-04e).
 */
@Composable
fun EpisodeEditorSheet(
    initial: EpisodeDraft,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (EpisodeDraft) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    var draft by remember { mutableStateOf(initial) }

    val categoryOptions = CHANNEL_CATEGORIES.map { SelectOption(it, categoryLabel(it)) }
    val languageOptions = LANGUAGES.map { SelectOption(it.code, "${it.nativeName} · ${it.name}", it.code) }

    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.episode_edit),
        subtitle = stringResource(R.string.episode_edit_subtitle),
        icon = "edit",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            TextField(value = draft.title, onValueChange = { v -> draft = draft.copy(title = v) }, label = stringResource(R.string.upload_title_field), autoFocus = true)
            SelectField(
                label = stringResource(R.string.upload_category),
                selected = draft.category.takeIf { it.isNotBlank() },
                options = categoryOptions,
                onSelect = { v -> draft = draft.copy(category = v) },
                placeholder = stringResource(R.string.upload_category_placeholder),
                leadingIcon = "tag",
                sheetTitle = stringResource(R.string.upload_category),
                rawSelectedLabel = draft.category.takeIf { it.isNotBlank() }?.let { categoryLabel(it) },
            )
            SelectField(
                label = stringResource(R.string.upload_language),
                selected = draft.languageCode,
                options = languageOptions,
                onSelect = { v -> draft = draft.copy(languageCode = v) },
                placeholder = stringResource(R.string.upload_language_placeholder),
                leadingIcon = "language",
                sheetTitle = stringResource(R.string.upload_language),
            )
            TagInput(tags = draft.tags, onTagsChange = { list -> draft = draft.copy(tags = list) }, label = stringResource(R.string.upload_tags))
            TextField(value = draft.description, onValueChange = { v -> draft = draft.copy(description = v) }, label = stringResource(R.string.upload_description), singleLine = false, minLines = 2, maxLines = 4)
            TextField(value = draft.author, onValueChange = { v -> draft = draft.copy(author = v) }, label = stringResource(R.string.upload_author))
            TextField(value = draft.narrator, onValueChange = { v -> draft = draft.copy(narrator = v) }, label = stringResource(R.string.upload_narrator))
            GlassChip(
                label = stringResource(R.string.upload_audiobook),
                icon = "music",
                selected = draft.isAudiobook,
                onClick = { draft = draft.copy(isAudiobook = !draft.isAudiobook) },
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("check"),
                    contentDescription = stringResource(R.string.action_save),
                    enabled = draft.isValid && !busy,
                    onClick = { onSubmit(draft) },
                )
            }
        }
    }
}
