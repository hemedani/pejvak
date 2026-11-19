package com.pejvak.app.ui.screens.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.online.OnlineCollectionInfo
import com.pejvak.app.domain.online.describeDownloadState
import com.pejvak.app.domain.online.describeKnownTrackCount
import com.pejvak.app.domain.online.findLanguage
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.RowAction
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun SourceScreen(
    onBack: () -> Unit,
    onOpenCollection: (String) -> Unit,
    viewModel: SourceViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val uriHandler = LocalUriHandler.current
    val source = state.source

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = source?.name ?: stringResource(R.string.tab_discover),
                overline = source?.nativeName,
                subtitle = source?.let {
                    findLanguage(it.languageCode)?.let { language -> "${language.nativeName} · ${it.description}" }
                        ?: it.description
                },
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
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
            top = topInset + geo.spacing.md,
            bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
        ),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        if (source != null) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    if (source.live) {
                        GlassChip(label = stringResource(R.string.discover_live), icon = "online", onClick = {})
                    }
                    GlassChip(
                        label = stringResource(R.string.discover_refresh),
                        icon = "refresh",
                        onClick = { viewModel.load(refresh = true) },
                    )
                    GlassChip(
                        label = stringResource(R.string.discover_homepage),
                        icon = "share",
                        onClick = { uriHandler.openUri(source.homepage) },
                    )
                }
            }
        }
        state.downloadError?.let { message ->
            item { InlineNotice(message = message, tone = NoticeTone.Danger) }
        }
        state.error?.let { message ->
            item {
                InlineNotice(
                    message = message,
                    title = stringResource(if (state.fromCache) R.string.discover_offline else R.string.discover_error),
                    tone = if (state.fromCache) NoticeTone.Warning else NoticeTone.Danger,
                    retryLabel = stringResource(R.string.action_retry),
                    onRetry = { viewModel.load(refresh = true) },
                )
            }
        }
        if (state.collections.isEmpty() && !state.loading) {
            item {
                EmptyState(
                    icon = "language",
                    title = stringResource(R.string.discover_empty_source),
                    body = stringResource(R.string.discover_empty_source_body),
                )
            }
        }
        if (state.collections.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.discover_collections),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.textSecondary,
                )
            }
            item {
                ListGroup(items = state.collections) { info, _ ->
                    CollectionRow(
                        info = info,
                        favorite = info.key in state.favorites,
                        downloadLabel = describeDownloadState(state.downloads[info.key]?.state),
                        onOpen = { onOpenCollection(info.key) },
                        onFavorite = { viewModel.toggleFavorite(info) },
                        onDownload = { viewModel.download(info) },
                    )
                }
            }
        }
        if (state.loading) {
            item {
                Text(
                    text = stringResource(R.string.discover_loading),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(geo.spacing.md),
                )
            }
        }
    }
    }
}

@Composable
private fun CollectionRow(
    info: OnlineCollectionInfo,
    favorite: Boolean,
    downloadLabel: String?,
    onOpen: () -> Unit,
    onFavorite: () -> Unit,
    onDownload: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    ListRow(
        title = info.title,
        subtitle = info.subtitle,
        meta = listOfNotNull(
            describeKnownTrackCount(info.trackCount) ?: findLanguage(info.languageCode)?.nativeName,
            downloadLabel,
        ).joinToString(" · ").ifBlank { null },
        leading = {
            PaletteTile(
                contentHash = info.key,
                label = info.title,
                artworkUrl = info.artworkUrl,
                size = geo.tiles.md,
            )
        },
        actions = listOf(
            RowAction(
                id = "favorite",
                icon = "favorite",
                label = stringResource(if (favorite) R.string.discover_unfavorite else R.string.discover_favorite),
                priority = 0,
                onClick = onFavorite,
            ),
            RowAction(
                id = "download",
                icon = "download",
                label = stringResource(R.string.download_start),
                priority = 1,
                onClick = onDownload,
            ),
        ),
        onClick = onOpen,
    )
}
