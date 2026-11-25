package com.pejvak.app.ui.screens.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.channel.Channel
import com.pejvak.app.domain.channel.ChannelAudio
import com.pejvak.app.domain.channel.channelSubtitle
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.UserText
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.RowAction
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * A public channel page (plan 07 CHAN-U02): identity, bio, categories, link actions,
 * then the channel's folders as **pages of a `HorizontalPager`** (AGENTS — a screen's own
 * tabs are pager pages, never a hand-rolled swipe) with each folder's episodes as
 * [ListRow]s that play through the existing engine (CHAN-U03).
 */
@Composable
fun ChannelDetailScreen(
    onBack: () -> Unit,
    onManage: (channelId: String) -> Unit,
    onEdit: (Channel) -> Unit,
    viewModel: ChannelDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()

    val folderCount = state.folders.size
    val pager = rememberPagerState(initialPage = 0) { folderCount + 1 }

    LaunchedEffect(pager) {
        snapshotFlow { pager.currentPage }.distinctUntilChanged().collect { page ->
            if (page > 0) viewModel.loadFolder(state.folders[page - 1].serverId)
        }
    }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = state.channel?.name ?: stringResource(R.string.channel_loading),
                subtitle = state.channel?.let { channelSubtitle(it) },
                userTitle = true,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
                actions = {
                    val owned = state.channel?.takeIf { it.isMine }
                    if (owned != null) {
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("edit"),
                            contentDescription = stringResource(R.string.channel_edit),
                            onClick = { onEdit(owned) },
                        )
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("folder"),
                            contentDescription = stringResource(R.string.channel_manage),
                            onClick = { onManage(owned.serverId) },
                        )
                    }
                },
            )
        },
        subHeader = {
            if (folderCount > 0) {
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = geo.spacing.lg),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    GlassChip(
                        label = stringResource(R.string.channel_folder_all),
                        selected = pager.currentPage == 0,
                        frosted = true,
                        icon = "list",
                        onClick = { scope.launch { pager.animateScrollToPage(0) } },
                    )
                    state.folders.forEachIndexed { index, folder ->
                        GlassChip(
                            label = folder.title,
                            selected = pager.currentPage == index + 1,
                            frosted = true,
                            icon = "folder",
                            count = folder.audioCount.takeIf { it > 0 },
                            onClick = { scope.launch { pager.animateScrollToPage(index + 1) } },
                        )
                    }
                }
            }
        },
    ) { topInset ->
        val channel = state.channel
        when {
            channel == null && state.loading -> {
                SkeletonRows(modifier = Modifier.padding(top = topInset, start = geo.spacing.lg, end = geo.spacing.lg))
            }

            channel == null -> {
                EmptyState(
                    icon = "channel",
                    title = stringResource(R.string.channel_error),
                    body = state.error,
                    modifier = Modifier.padding(top = topInset),
                )
            }

            else -> {
                HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                    val audios: List<ChannelAudio> = if (page == 0) {
                        state.allAudios
                    } else {
                        viewModel.audiosFor(state.folders[page - 1])
                    }
                    ChannelBody(
                        channel = channel,
                        audios = audios,
                        topInset = topInset,
                        fromCache = state.fromCache,
                        error = state.error,
                        onRetry = viewModel::load,
                        onOpenLink = { uriHandler.openUri(it) },
                        onPlay = { index -> viewModel.play(audios, index) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ChannelBody(
    channel: Channel,
    audios: List<ChannelAudio>,
    topInset: androidx.compose.ui.unit.Dp,
    fromCache: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onOpenLink: (String) -> Unit,
    onPlay: (Int) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val bottom = LocalShellInsets.current.bottom + geo.spacing.xxl
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = geo.spacing.lg, end = geo.spacing.lg, top = topInset, bottom = bottom),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        item { ChannelIdentity(channel = channel, onOpenLink = onOpenLink) }

        if (fromCache && error != null) {
            item {
                InlineNotice(
                    message = error,
                    tone = NoticeTone.Warning,
                    title = stringResource(R.string.channels_offline_title),
                    retryLabel = stringResource(R.string.action_retry),
                    onRetry = onRetry,
                )
            }
        }

        if (audios.isEmpty()) {
            item {
                EmptyState(
                    icon = "podcast",
                    title = stringResource(R.string.channels_empty_title),
                    body = stringResource(R.string.channels_empty_body),
                )
            }
        } else {
            itemsIndexed(audios, key = { _, audio -> audio.serverId }) { index, audio ->
                ListGroup(items = listOf(audio)) { _, _ ->
                    ListRow(
                        title = audio.title,
                        subtitle = audio.author ?: audio.category?.replaceFirstChar { it.uppercase() },
                        meta = audio.durationSec.takeIf { it > 0 }?.let { formatDuration(it) },
                        leading = {
                            PaletteTile(
                                contentHash = audio.contentHash,
                                label = audio.title,
                                artworkUrl = audio.artworkUrl,
                                size = geo.tiles.md,
                            )
                        },
                        actions = listOf(
                            RowAction(
                                id = "play",
                                icon = "play",
                                label = stringResource(R.string.channel_play),
                                priority = 0,
                                onClick = { onPlay(index) },
                            ),
                        ),
                        onClick = { onPlay(index) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ChannelIdentity(
    channel: Channel,
    onOpenLink: (String) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    GlassCard {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                PaletteTile(contentHash = channel.slug, label = channel.name, artworkUrl = channel.avatarUrl, size = geo.tiles.lg)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
                    UserText(text = channel.name, style = MaterialTheme.typography.titleLarge, color = tokens.text)
                    channelSubtitle(channel)?.let {
                        Text(text = it, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary)
                    }
                }
            }
            if (channel.categories.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    // Non-frosted: these chips sit inside the ScreenFrame backdrop source, so a
                    // frosted (Backdrop-sampling) chip would sample itself → render-node cycle crash.
                    channel.categories.forEach { GlassChip(label = it.replaceFirstChar { c -> c.uppercase() }, icon = "tag") }
                }
            }
            // Showcase gallery strip (U02): the creator's uploaded images, stored as URLs.
            if (channel.gallery.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    channel.gallery.forEach { url ->
                        AsyncImage(
                            model = url,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(width = 120.dp, height = 84.dp)
                                .clip(RoundedCornerShape(geo.radius.md)),
                        )
                    }
                }
            }
            if (!channel.bio.isNullOrBlank()) {
                Text(text = stringResource(R.string.channel_bio).uppercase(), style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
                UserText(text = channel.bio, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
            }
            val links = listOfNotNull(
                channel.donationUrl?.let { it to R.string.channel_donation },
                channel.websiteUrl?.let { it to R.string.channel_website },
                channel.contactEmail?.let { ("mailto:${it}") to R.string.channel_contact },
            )
            if (links.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    links.forEach { (url, labelRes) ->
                        GlassChip(label = stringResource(labelRes), icon = "online", onClick = { onOpenLink(url) })
                    }
                }
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}" else "$m:${s.toString().padStart(2, '0')}"
}
