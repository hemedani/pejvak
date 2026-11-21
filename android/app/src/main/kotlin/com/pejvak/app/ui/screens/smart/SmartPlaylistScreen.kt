package com.pejvak.app.ui.screens.smart

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.COMMUTE_BUDGETS_SEC
import com.pejvak.app.domain.SmartRuleId
import com.pejvak.app.domain.formatDuration
import com.pejvak.app.domain.ruleFor
import com.pejvak.app.ui.components.AddToPlaylistSheet
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

@Composable
fun SmartPlaylistScreen(
    onBack: () -> Unit,
    onOpenTrack: (String) -> Unit,
    viewModel: SmartPlaylistViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val rule = ruleFor(state.ruleId)
    val playlist = state.playlist
    var addOpen by remember { mutableStateOf(false) }

    ScreenFrame(
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                title = rule.title,
                overline = rule.tagline,
                subtitle = playlist?.let {
                    "${it.summary} · ${formatDuration(it.totalDurationSec)}"
                },
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
        OceanCascade(key = playlist?.picks?.isNotEmpty() == true) {
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
                var order = 0
                if (state.ruleId == SmartRuleId.Commute) {
                    val idx = order++
                    item {
                        Row(
                            modifier = Modifier.oceanEntrance(idx, swayDp = 0.dp),
                            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                        ) {
                            COMMUTE_BUDGETS_SEC.forEach { budget ->
                                GlassChip(
                                    label = formatDuration(budget),
                                    selected = state.budgetSec == budget,
                                    icon = "timer",
                                    onClick = { viewModel.setBudget(budget) },
                                )
                            }
                        }
                    }
                }
                val playIdx = order++
                item {
                    PrimaryButton(
                        label = stringResource(R.string.library_play),
                        enabled = !playlist?.picks.isNullOrEmpty(),
                        onClick = { viewModel.play() },
                        modifier = Modifier.oceanEntrance(playIdx, swayDp = 0.dp),
                    )
                }
                val chipsIdx = order++
                item {
                    Row(
                        modifier = Modifier.oceanEntrance(chipsIdx, swayDp = 0.dp),
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                    ) {
                        GlassChip(
                            label = if (state.saved) stringResource(R.string.smart_saved)
                            else stringResource(R.string.folder_save_playlist),
                            icon = "addToPlaylist",
                            onClick = viewModel::saveAsPlaylist,
                        )
                        GlassChip(
                            label = stringResource(R.string.smart_add_all_playlist),
                            icon = "addToPlaylist",
                            onClick = { addOpen = true },
                        )
                    }
                }
                val emptyReason = playlist?.emptyReason
                if (emptyReason != null) {
                    val emptyIdx = order++
                    item {
                        EmptyState(
                            icon = "ai",
                            title = stringResource(R.string.smart_empty),
                            body = emptyReason,
                            modifier = Modifier.oceanEntrance(emptyIdx, swayDp = 0.dp),
                        )
                    }
                }
                val picksBase = order
                itemsIndexed(playlist?.picks.orEmpty(), key = { _, pick -> pick.track.id }) { index, pick ->
                    GlassCard(
                        modifier = Modifier
                            .oceanEntrance(picksBase + index)
                            .clickable { viewModel.play(index) },
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            PaletteTile(
                                contentHash = pick.track.contentHash,
                                label = pick.track.title,
                                artworkUrl = pick.track.artworkUrl,
                                size = geo.tiles.md,
                            )
                            Spacer(Modifier.size(geo.spacing.md))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    text = pick.track.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = tokens.text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = pick.reason,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.textSecondary,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            BubbleButton(
                                icon = ICON_GLYPHS.getValue("play"),
                                contentDescription = stringResource(R.string.library_play),
                                onClick = { viewModel.play(index) },
                            )
                        }
                    }
                }
                if (!state.loading && playlist?.picks?.isEmpty() == true && emptyReason == null) {
                    item {
                        InlineNotice(
                            message = stringResource(R.string.smart_empty_body),
                            title = stringResource(R.string.smart_empty),
                        )
                    }
                }
            }
        }
    }
    if (addOpen) {
        AddToPlaylistSheet(
            playlists = state.playlists,
            onDismiss = { addOpen = false },
            onPick = {
                viewModel.addAllToPlaylist(it)
                addOpen = false
            },
            onCreate = {
                viewModel.createPlaylistWithAll(it)
                addOpen = false
            },
        )
    }

}
