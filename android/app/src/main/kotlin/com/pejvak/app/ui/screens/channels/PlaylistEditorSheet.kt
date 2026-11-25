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
import com.pejvak.app.domain.channel.PlaylistDraft
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/** Add or rename a folder (channelPlaylist) — plan 07 CHAN-C03. Title + one category. */
@Composable
fun PlaylistEditorSheet(
    existing: PlaylistDraft?,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (PlaylistDraft) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    var draft by remember { mutableStateOf(existing ?: PlaylistDraft()) }

    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(if (existing == null) R.string.folder_add else R.string.folder_rename),
        subtitle = stringResource(R.string.folder_subtitle),
        icon = "folder",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            TextField(
                value = draft.title,
                onValueChange = { v -> draft = draft.copy(title = v) },
                label = stringResource(R.string.folder_title),
                autoFocus = true,
            )
            TextField(
                value = draft.category,
                onValueChange = { v -> draft = draft.copy(category = v) },
                label = stringResource(R.string.folder_category),
            )
            TextField(
                value = draft.description,
                onValueChange = { v -> draft = draft.copy(description = v) },
                label = stringResource(R.string.folder_description),
                singleLine = false,
                minLines = 2,
                maxLines = 4,
            )
            TagInput(tags = draft.tags, onTagsChange = { list -> draft = draft.copy(tags = list) }, label = stringResource(R.string.folder_tags))

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
