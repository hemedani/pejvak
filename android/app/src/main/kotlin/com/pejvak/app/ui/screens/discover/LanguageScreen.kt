package com.pejvak.app.ui.screens.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.online.findLanguage
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.ScreenHeader
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun LanguageScreen(
    onBack: () -> Unit,
    onOpenSource: (String) -> Unit,
    viewModel: LanguageSourcesViewModel = hiltViewModel(),
) {
    val sources by viewModel.sources.collectAsStateWithLifecycle()
    val geo = LocalPejvakGeometry.current
    val tokens = LocalPejvakTokens.current
    val language = findLanguage(viewModel.code)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(geo.spacing.lg, geo.spacing.xxl, geo.spacing.lg, geo.spacing.xxl),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        item {
            ScreenHeader(
                title = language?.nativeName ?: viewModel.code,
                overline = language?.let { "${it.name} · ${it.code}" },
                subtitle = stringResource(R.string.discover_language_sources_body),
                action = {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("back"),
                        contentDescription = stringResource(R.string.action_back),
                        onClick = onBack,
                    )
                },
            )
        }
        if (sources.isEmpty()) {
            item {
                EmptyState(
                    icon = "language",
                    title = stringResource(R.string.discover_no_sources),
                    body = stringResource(R.string.discover_no_sources_body),
                )
            }
        } else {
            item {
                ListGroup(items = sources) { source, _ ->
                    ListRow(
                        title = source.name,
                        subtitle = source.nativeName,
                        meta = source.description,
                        leading = {
                            PaletteTile(
                                contentHash = source.id,
                                label = source.name,
                                size = geo.tiles.md,
                            )
                        },
                        onClick = { onOpenSource(source.id) },
                    )
                }
            }
        }
        item {
            Text(
                text = stringResource(R.string.discover_attribution_note),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
                modifier = Modifier.padding(geo.spacing.md),
            )
        }
    }
}
