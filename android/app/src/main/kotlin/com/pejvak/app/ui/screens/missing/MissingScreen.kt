package com.pejvak.app.ui.screens.missing

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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.describeStake
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

@Composable
fun MissingScreen(
    onBack: () -> Unit,
    onImport: () -> Unit,
    onOpenTrack: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MissingViewModel = hiltViewModel(),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by viewModel.state.collectAsStateWithLifecycle()

    // A relink happens on the import screen, so re-read on the way back or this
    // would keep listing files that are already fixed.
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }

    ScreenFrame(
        modifier = modifier,
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                overline = stringResource(R.string.missing_overline),
                title = stringResource(R.string.missing_title),
                subtitle = state.summary,
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.back),
                        onClick = onBack,
                    )
                },
            )
        },
    ) { topInset ->
        OceanCascade(key = state.groups.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = geo.spacing.xl,
                        end = geo.spacing.xl,
                        top = topInset + geo.spacing.md,
                        bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
                    ),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.xl),
            ) {

                if (state.missing.isEmpty()) {
                    if (state.loading) {
                        SkeletonRows(count = 3)
                    } else {
                        EmptyState(
                            icon = "check",
                            title = stringResource(R.string.missing_empty_title),
                            body = stringResource(R.string.missing_empty_body),
                            modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                        )
                    }
                } else {
                    InlineNotice(
                        tone = NoticeTone.Danger,
                        title = stringResource(R.string.missing_notice_title),
                        message = stringResource(R.string.missing_notice_body),
                        modifier = Modifier.oceanEntrance(0, swayDp = 0.dp),
                        action = {
                            PrimaryButton(label = stringResource(R.string.missing_find_again), onClick = onImport)
                        },
                    )

                    state.groups.forEachIndexed { idx, group ->
                        Column(
                            modifier = Modifier.oceanEntrance(1 + idx),
                            verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                            ) {
                                PejvakIcon(
                                    name = "folder",
                                    contentDescription = null,
                                    tint = tokens.textTertiary,
                                    size = geo.icons.xs
                                )
                                Text(
                                    text = group.folderName,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textTertiary,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                )
                                Text(
                                    text = group.tracks.size.toString(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textTertiary,
                                )
                            }
                            ListGroup(items = group.tracks, staggerRows = true) { item, _ ->
                                val stake = describeStake(item.sessionCount, item.listenedSec, item.annotationCount)
                                ListRow(
                                    title = item.track.title,
                                    subtitle = stake ?: stringResource(R.string.missing_never_played),
                                    leading = {
                                        PaletteTile(
                                            contentHash = item.track.contentHash,
                                            label = item.track.title,
                                            artworkUrl = item.track.artworkUrl,
                                            size = geo.tiles.md,
                                        )
                                    },
                                    trailing = {
                                        PejvakIcon(
                                            name = "chevronRight",
                                            contentDescription = null,
                                            tint = tokens.textTertiary,
                                            size = geo.icons.sm
                                        )
                                    },
                                    onClick = { onOpenTrack(item.track.id) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
