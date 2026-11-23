package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import com.pejvak.app.R
import com.pejvak.app.domain.Playlist
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun AddToPlaylistSheet(
    playlists: List<Playlist>,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
    onCreate: (String) -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var draft by remember { mutableStateOf("") }

    GlassSheet(onDismiss = onDismiss, title = stringResource(R.string.library_playlist_new), icon = "playlist") {
        Column(Modifier.fillMaxWidth()) {
            TextField(
                value = draft,
                onValueChange = { draft = it },
                label = stringResource(R.string.library_playlist_name),
                placeholder = stringResource(R.string.library_playlist_name),
            )
            Spacer(Modifier.height(geo.spacing.sm))
            PrimaryButton(
                label = stringResource(R.string.library_playlist_create),
                enabled = draft.isNotBlank(),
                onClick = { onCreate(draft) },
            )
            Spacer(Modifier.height(geo.spacing.md))
            if (playlists.isEmpty()) {
                Text(
                    text = stringResource(R.string.library_empty_playlists),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.sm),
                )
            }
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                items(playlists, key = { it.id }) { playlist ->
                    GlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(playlist.id) },
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(geo.tiles.sm)
                                    .clip(CircleShape)
                                    .background(tokens.accentTeal.copy(alpha = 0.16f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                PejvakIcon(
                                    name = "playlist",
                                    contentDescription = null,
                                    tint = tokens.accentTeal,
                                    size = geo.icons.sm,
                                )
                            }
                            Text(
                                text = playlist.title,
                                style = MaterialTheme.typography.titleSmall,
                                color = tokens.text,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}
