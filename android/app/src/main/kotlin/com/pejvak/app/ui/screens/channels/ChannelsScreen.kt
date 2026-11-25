package com.pejvak.app.ui.screens.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.channelSubtitle
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.HeaderSearch
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

/**
 * The Channels hub (plan 07 CHAN-U01): a searchable, category-filtered list of public
 * channels, rendered from the live server pull over the Room cache. Design system governs
 * every surface — `GlassHeader` (with its inline search), `GlassChip` filters, `GlassCard`
 * rows via `ListGroup`/`ListRow`, `PaletteTile` keyed on the channel slug.
 */
@Composable
fun ChannelsScreen(
    onBack: () -> Unit,
    onOpenChannel: (slug: String) -> Unit,
    onCreate: () -> Unit,
    onMyChannels: () -> Unit,
    viewModel: ChannelsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.channels_title),
                subtitle = stringResource(R.string.channels_subtitle),
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                search = HeaderSearch(
                    value = state.query,
                    onValueChange = viewModel::onQueryChange,
                    placeholder = stringResource(R.string.channels_search_placeholder),
                ),
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("person"),
                        contentDescription = stringResource(R.string.my_channels_title),
                        onClick = onMyChannels,
                    )
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("add"),
                        contentDescription = stringResource(R.string.my_channels_new),
                        onClick = onCreate,
                    )
                },
            )
        },
        subHeader = {
            if (state.categories.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = geo.spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    GlassChip(
                        label = stringResource(R.string.channels_category_all),
                        selected = state.selectedCategory == null,
                        frosted = true,
                        icon = "discover",
                        onClick = { viewModel.selectCategory(null) },
                    )
                    state.categories.forEach { category ->
                        GlassChip(
                            label = category.replaceFirstChar { it.uppercase() },
                            selected = state.selectedCategory == category,
                            frosted = true,
                            icon = "tag",
                            onClick = { viewModel.selectCategory(category) },
                        )
                    }
                }
            }
        },
    ) { topInset ->
        val bottom = LocalShellInsets.current.bottom + geo.spacing.xxl
        when {
            state.channels.isEmpty() && state.loading -> {
                SkeletonRows(modifier = Modifier.padding(top = topInset, start = geo.spacing.lg, end = geo.spacing.lg))
            }

            state.channels.isEmpty() -> {
                ChannelsEmpty(state, topInset, bottom, onRetry = viewModel::refresh)
            }

            else -> {
                OceanCascade(key = state.channels.size) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = geo.spacing.lg,
                            end = geo.spacing.lg,
                            top = topInset,
                            bottom = bottom,
                        ),
                        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
                    ) {
                        if (state.error != null) {
                            item {
                                InlineNotice(
                                    message = state.error ?: stringResource(R.string.channels_offline_body),
                                    tone = if (state.offline) NoticeTone.Warning else NoticeTone.Danger,
                                    title = stringResource(
                                        if (state.offline) R.string.channels_offline_title else R.string.channels_error_title,
                                    ),
                                    modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                                )
                            }
                        }
                        itemsIndexed(state.channels, key = { _, channel -> channel.serverId }) { index, channel ->
                            ChannelCard(
                                channel = channel,
                                modifier = Modifier.oceanEntrance(index),
                                onClick = { onOpenChannel(channel.slug) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelsEmpty(
    state: ChannelsUiState,
    topInset: androidx.compose.ui.unit.Dp,
    bottom: androidx.compose.ui.unit.Dp,
    onRetry: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = geo.spacing.lg, end = geo.spacing.lg, top = topInset, bottom = bottom),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
    ) {
        if (state.error != null) {
            item {
                InlineNotice(
                    message = state.error,
                    tone = NoticeTone.Danger,
                    title = stringResource(R.string.channels_error_title),
                    retryLabel = stringResource(R.string.action_retry),
                    onRetry = onRetry,
                )
            }
        }
        item {
            EmptyState(
                icon = "channel",
                title = stringResource(R.string.channels_empty_title),
                body = stringResource(R.string.channels_empty_body),
            )
        }
    }
}

@Composable
private fun ChannelCard(
    channel: Channel,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    ListGroup(items = listOf(channel), modifier = modifier) { _, _ ->
        ListRow(
            title = channel.name,
            subtitle = channelSubtitle(channel),
            meta = channel.categories.takeIf { it.isNotEmpty() }?.joinToString(" · ") { it.replaceFirstChar { c -> c.uppercase() } },
            leading = {
                PaletteTile(
                    contentHash = channel.slug,
                    label = channel.name,
                    artworkUrl = channel.avatarUrl,
                    size = geo.tiles.md,
                )
            },
            onClick = onClick,
        )
    }
}
