package com.pejvak.app.ui.screens.channels

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.ChannelSocial
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * The create/edit channel sheet (plan 07 CHAN-C02). A `GlassSheet` form on the app's own
 * `TextField`/`TagInput` primitives: name, bio, categories (≥1, inline-validated like the
 * server), language, avatar + gallery (image upload via the multipart act), donation /
 * website / contact, and dynamic social rows. Submit calls `createChannel`/`updateChannel`;
 * an over-cap refusal lands in a non-blocking [InlineNotice] (prompt D6).
 */
@Composable
fun ChannelEditorSheet(
    viewModel: ChannelCreatorViewModel,
    onDismiss: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current

    LaunchedEffect(state.saved) {
        if (state.saved) onDismiss()
    }

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { viewModel.uploadAvatar(it.toString()) }
    }
    val galleryPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { viewModel.uploadGalleryImage(it.toString()) }
    }

    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(if (state.isCreate) R.string.channel_editor_create else R.string.channel_editor_edit),
        subtitle = stringResource(R.string.channel_editor_subtitle),
        icon = "channel",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            if (state.notice != null) {
                InlineNotice(
                    message = state.notice!!,
                    tone = NoticeTone.Warning,
                    title = stringResource(R.string.channel_notice_title),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            TextField(
                value = state.draft.name,
                onValueChange = { v -> viewModel.update { it.copy(name = v) } },
                label = stringResource(R.string.channel_editor_name),
                placeholder = stringResource(R.string.channel_editor_name_placeholder),
                error = if (state.nameInvalid) stringResource(R.string.channel_editor_name_required) else null,
                autoFocus = true,
            )

            TextField(
                value = state.draft.bio,
                onValueChange = { v -> viewModel.update { it.copy(bio = v) } },
                label = stringResource(R.string.channel_editor_bio),
                singleLine = false,
                minLines = 2,
                maxLines = 5,
            )

            TagInput(
                tags = state.draft.categories,
                onTagsChange = { list -> viewModel.update { it.copy(categories = list) } },
                label = stringResource(R.string.channel_editor_categories),
            )
            if (state.categoriesInvalid) {
                Text(text = stringResource(R.string.channel_editor_categories_required), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }

            TextField(
                value = state.draft.languageCode.orEmpty(),
                onValueChange = { v -> viewModel.update { it.copy(languageCode = v.takeIf { it.isNotBlank() }) } },
                label = stringResource(R.string.channel_editor_language),
                placeholder = stringResource(R.string.channel_editor_language_placeholder),
            )

            // Avatar
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                PaletteTile(contentHash = state.draft.name, label = state.draft.name.ifBlank { "?" }, artworkUrl = state.draft.avatarUrl, size = geo.tiles.lg)
                TextButton(
                    onClick = { avatarPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = !state.avatarBusy,
                ) {
                    Text(stringResource(if (state.avatarBusy) R.string.channel_uploading else R.string.channel_editor_avatar))
                }
            }

            // Gallery
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                Text(stringResource(R.string.channel_editor_gallery), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (state.draft.gallery.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                        state.draft.gallery.forEach { url ->
                            PaletteTile(contentHash = url, label = "·", artworkUrl = url, size = geo.tiles.md)
                        }
                    }
                    TextButton(onClick = { viewModel.update { it.copy(gallery = emptyList()) } }) {
                        Text(stringResource(R.string.channel_editor_gallery_clear))
                    }
                }
                TextButton(
                    onClick = { galleryPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = !state.galleryBusy,
                ) {
                    Text(stringResource(if (state.galleryBusy) R.string.channel_uploading else R.string.channel_editor_gallery_add))
                }
            }

            TextField(
                value = state.draft.donationUrl,
                onValueChange = { v -> viewModel.update { it.copy(donationUrl = v) } },
                label = stringResource(R.string.channel_editor_donation),
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri,
                placeholder = "https://…",
            )
            TextField(
                value = state.draft.websiteUrl,
                onValueChange = { v -> viewModel.update { it.copy(websiteUrl = v) } },
                label = stringResource(R.string.channel_editor_website),
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri,
                placeholder = "https://…",
            )
            TextField(
                value = state.draft.contactEmail,
                onValueChange = { v -> viewModel.update { it.copy(contactEmail = v) } },
                label = stringResource(R.string.channel_editor_contact),
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Email,
            )

            // Socials
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                Text(stringResource(R.string.channel_editor_socials), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.draft.socials.forEachIndexed { index, social ->
                    SocialRow(
                        social = social,
                        onChange = { updated -> viewModel.update { it.copy(socials = it.socials.toMutableList().also { list -> list[index] = updated }) } },
                        onRemove = { viewModel.update { it.copy(socials = it.socials.toMutableList().also { list -> list.removeAt(index) }) } },
                    )
                }
                GlassChip(
                    label = stringResource(R.string.channel_editor_social_add),
                    icon = "add",
                    frosted = true,
                    onClick = { viewModel.update { it.copy(socials = it.socials + ChannelSocial("", "")) } },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("check"),
                    contentDescription = stringResource(R.string.action_save),
                    onClick = viewModel::submit,
                    enabled = state.canSubmit,
                )
            }
        }
    }
}

@Composable
private fun SocialRow(
    social: ChannelSocial,
    onChange: (ChannelSocial) -> Unit,
    onRemove: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        TextField(
            value = social.platform,
            onValueChange = { v -> onChange(social.copy(platform = v)) },
            placeholder = stringResource(R.string.channel_editor_social_platform),
            modifier = Modifier.weight(1f),
        )
        TextField(
            value = social.url,
            onValueChange = { v -> onChange(social.copy(url = v)) },
            placeholder = stringResource(R.string.channel_editor_social_url),
            keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri,
            modifier = Modifier.weight(1.6f),
        )
        BubbleButton(
            icon = ICON_GLYPHS.getValue("delete"),
            contentDescription = stringResource(R.string.action_delete),
            onClick = onRemove,
            size = geo.controls.sm,
        )
    }
}
