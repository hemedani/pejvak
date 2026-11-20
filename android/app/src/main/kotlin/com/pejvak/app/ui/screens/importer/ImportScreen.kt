package com.pejvak.app.ui.screens.importer

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.ScanCandidate
import com.pejvak.app.domain.ScanPlan
import com.pejvak.app.domain.ScanStatus
import com.pejvak.app.domain.needsIdentification
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.GlassHeader
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.ScreenFrame
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

private fun statusLabel(status: ScanStatus): String = when (status) {
    ScanStatus.New -> "New"
    ScanStatus.Changed -> "Changed"
    ScanStatus.Known -> "In library"
    ScanStatus.Duplicate -> "Duplicate"
    // "Moved" rather than "Relink": the listener moved a folder, they did not ask
    // for a database operation.
    ScanStatus.Relink -> "Moved"
}

private fun summaryLine(plan: ScanPlan): String {
    val s = plan.summary
    val parts = mutableListOf("${s.total} found")
    if (s.new > 0) parts.add("${s.new} new")
    if (s.relink > 0) parts.add("${s.relink} moved")
    if (s.changed > 0) parts.add("${s.changed} changed")
    if (s.known > 0) parts.add("${s.known} already here")
    if (s.duplicate > 0) parts.add("${s.duplicate} duplicate${if (s.duplicate == 1) "" else "s"}")
    return parts.joinToString(" · ")
}

@Composable
fun ImportScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ImportViewModel = hiltViewModel(),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by viewModel.state.collectAsStateWithLifecycle()

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.scanDevice()
    }
    val folderLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) viewModel.onFolderPicked(uri)
    }

    ScreenFrame(
        modifier = modifier,
        header = { headerModifier ->
            GlassHeader(
                modifier = headerModifier,
                overline = stringResource(R.string.import_overline),
                title = stringResource(R.string.import_title),
                subtitle = state.plan?.let { summaryLine(it) } ?: stringResource(R.string.import_subtitle),
                leading = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("close"),
                        contentDescription = stringResource(R.string.import_close),
                        onClick = onBack,
                    )
                },
            )
        },
    ) { topInset ->
        OceanCascade(key = Pair(state.phase, state.visible.isNotEmpty())) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = geo.spacing.xl),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    top = topInset + geo.spacing.md,
                    bottom = LocalShellInsets.current.bottom + geo.spacing.xxl,
                ),
            ) {

                when (state.phase) {
                    ImportViewModel.Phase.Choose -> {
                        item {
                            GlassCard(modifier = Modifier.oceanEntrance(0)) {
                                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    Text(
                                        stringResource(R.string.import_scan_device),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = tokens.text
                                    )
                                    Text(
                                        stringResource(R.string.import_scan_device_body),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = tokens.textSecondary
                                    )
                                    PrimaryButton(
                                        label = stringResource(R.string.import_scan_device_action),
                                        onClick = {
                                            if (viewModel.hasAudioPermission()) viewModel.scanDevice()
                                            else permissionLauncher.launch(viewModel.requiredAudioPermission())
                                        },
                                    )
                                }
                            }
                        }
                        item {
                            GlassCard(modifier = Modifier.oceanEntrance(1)) {
                                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    Text(
                                        stringResource(R.string.import_pick_folder),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = tokens.text
                                    )
                                    Text(
                                        stringResource(R.string.import_pick_folder_body),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = tokens.textSecondary
                                    )
                                    PrimaryButton(
                                        label = stringResource(R.string.import_pick_folder_action),
                                        onClick = { folderLauncher.launch(null) },
                                    )
                                }
                            }
                        }
                        if (state.error != null) {
                            item {
                                Text(
                                    state.error.orEmpty(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.danger
                                )
                            }
                        }
                    }

                    ImportViewModel.Phase.Scanning, ImportViewModel.Phase.Importing -> {
                        item {
                            val label =
                                if (state.phase == ImportViewModel.Phase.Importing) stringResource(R.string.import_importing) else state.busyLabel
                            GlassCard(modifier = Modifier.oceanEntrance(0, swayDp = 0.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    Text(label, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                                    Text(
                                        text = when {
                                            state.progress.total > 0 -> "${state.progress.done} of ${state.progress.total}"
                                            state.progress.done > 0 -> "${state.progress.done} file${if (state.progress.done == 1) "" else "s"} found…"
                                            else -> stringResource(R.string.import_progress_wait)
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = tokens.textSecondary,
                                    )
                                    LinearProgressIndicator(
                                        progress = {
                                            if (state.progress.total > 0) state.progress.done.toFloat() / state.progress.total else 0f
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        color = tokens.accent,
                                        trackColor = tokens.glassFill,
                                    )
                                }
                            }
                        }
                    }

                    ImportViewModel.Phase.Preview -> {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    GlassChip(
                                        label = stringResource(
                                            R.string.import_chip_new_or_moved,
                                            state.actionable.size
                                        ),
                                        selected = state.newOnly,
                                        onClick = { viewModel.setNewOnly(true) },
                                    )
                                    GlassChip(
                                        label = stringResource(
                                            R.string.import_chip_all,
                                            state.plan?.summary?.total ?: 0
                                        ),
                                        selected = !state.newOnly,
                                        onClick = { viewModel.setNewOnly(false) },
                                    )
                                }
                                val buttonLabel = when {
                                    state.identifying -> stringResource(R.string.import_identifying)
                                    state.hasRelinks -> stringResource(
                                        R.string.import_add_or_relink,
                                        state.actionable.size
                                    )

                                    else -> stringResource(R.string.import_import_n, state.actionable.size)
                                }
                                PrimaryButton(
                                    label = buttonLabel,
                                    loading = state.identifying,
                                    enabled = state.actionable.isNotEmpty(),
                                    onClick = { viewModel.commit() },
                                )
                            }
                        }
                        if (!state.identifying && state.visible.isEmpty()) {
                            item {
                                Text(
                                    text = if (state.newOnly) stringResource(R.string.import_empty_new) else stringResource(
                                        R.string.import_empty_all
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.textTertiary,
                                    modifier = Modifier.fillMaxWidth().padding(vertical = geo.spacing.huge),
                                )
                            }
                        }
                        itemsIndexed(
                            state.visible,
                            key = { _, candidate -> candidate.file.sourceId }) { idx, candidate ->
                            CandidateRow(candidate, modifier = Modifier.oceanEntrance(1 + idx))
                        }
                    }

                    ImportViewModel.Phase.Done -> {
                        item {
                            val outcome = state.outcome
                            GlassCard(modifier = Modifier.oceanEntrance(0, swayDp = 0.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                                    val headlineParts = mutableListOf<String>()
                                    if ((outcome?.imported?.size
                                            ?: 0) > 0
                                    ) headlineParts.add("${outcome!!.imported.size} added")
                                    if ((outcome?.relinked
                                            ?: 0) > 0
                                    ) headlineParts.add("${outcome!!.relinked} relinked")
                                    Text(
                                        text = headlineParts.joinToString(" · ")
                                            .ifEmpty { stringResource(R.string.import_nothing_new) },
                                        style = MaterialTheme.typography.titleMedium,
                                        color = tokens.text,
                                    )
                                    val detailParts = mutableListOf<String>()
                                    if ((outcome?.relinked
                                            ?: 0) > 0
                                    ) detailParts.add(stringResource(R.string.import_relink_keeps))
                                    if ((outcome?.duplicates
                                            ?: 0) > 0
                                    ) detailParts.add(stringResource(R.string.import_already, outcome!!.duplicates))
                                    if ((outcome?.failed
                                            ?: 0) > 0
                                    ) detailParts.add(stringResource(R.string.import_unreadable, outcome!!.failed))
                                    Text(
                                        text = detailParts.joinToString(" · ")
                                            .ifEmpty { stringResource(R.string.import_all_already) },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = tokens.textSecondary,
                                    )
                                    PrimaryButton(
                                        label = stringResource(R.string.import_back_to_library),
                                        onClick = onBack
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CandidateRow(candidate: ScanCandidate, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    ListGroup(items = listOf(candidate), modifier = modifier) { item, _ ->
        ListRow(
            title = item.file.fileName,
            subtitle = item.file.folderName ?: stringResource(R.string.import_no_folder),
            trailing = {
                Text(
                    text = statusLabel(item.status),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (needsIdentification(item.status)) tokens.text else tokens.textTertiary,
                )
            },
        )
    }
}
