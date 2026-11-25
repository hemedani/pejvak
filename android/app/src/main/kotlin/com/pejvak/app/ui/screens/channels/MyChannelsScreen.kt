package com.pejvak.app.ui.screens.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelStatus
import com.pejvak.app.domain.channel.channelSubtitle
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.StatusSpec
import com.pejvak.app.ui.components.row.StatusTone
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

/** The creator's "My channels" list (plan 07 CHAN-C01) with a New-channel action. */
@Composable
fun MyChannelsScreen(
    onBack: () -> Unit,
    onCreate: () -> Unit,
    onOpenChannel: (slug: String) -> Unit,
    viewModel: MyChannelsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = stringResource(R.string.my_channels_title),
                subtitle = stringResource(R.string.my_channels_subtitle),
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                actions = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("add"),
                        contentDescription = stringResource(R.string.my_channels_new),
                        onClick = onCreate,
                    )
                },
            )
        },
    ) { topInset ->
        val bottom = LocalShellInsets.current.bottom + geo.spacing.xxl
        if (state.channels.isEmpty() && state.loading) {
            SkeletonRows(modifier = Modifier.padding(top = topInset, start = geo.spacing.lg, end = geo.spacing.lg))
        } else if (state.channels.isEmpty()) {
            OceanCascade(key = 0) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = geo.spacing.lg, end = geo.spacing.lg, top = topInset, bottom = bottom),
                    verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
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
                    item {
                        EmptyState(
                            icon = "channel",
                            title = stringResource(R.string.my_channels_empty),
                            body = stringResource(R.string.my_channels_empty_body),
                        )
                    }
                }
            }
        } else {
            OceanCascade(key = state.channels.size) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = geo.spacing.lg, end = geo.spacing.lg, top = topInset, bottom = bottom),
                    verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
                ) {
                    if (state.notice != null) {
                        item {
                            InlineNotice(
                                message = state.notice!!,
                                tone = NoticeTone.Warning,
                                title = stringResource(R.string.channel_notice_title),
                                modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                            )
                        }
                    }
                    itemsIndexed(state.channels, key = { _, channel -> channel.serverId }) { index, channel ->
                        ListGroup(items = listOf(channel), modifier = Modifier.oceanEntrance(index)) { _, _ ->
                            ListRow(
                                title = channel.name,
                                subtitle = channelSubtitle(channel),
                                meta = channel.categories.joinToString(" · ") { it.replaceFirstChar { c -> c.uppercase() } }
                                    .ifBlank { null },
                                status = if (channel.status == ChannelStatus.Removed) {
                                    StatusSpec(kind = "error", label = stringResource(R.string.channel_taken_down_short), tone = StatusTone.Danger)
                                } else null,
                                leading = {
                                    PaletteTile(contentHash = channel.slug, label = channel.name, artworkUrl = channel.avatarUrl, size = geo.tiles.md)
                                },
                                onClick = { onOpenChannel(channel.slug) },
                            )
                        }
                    }
                }
            }
        }
    }
}
