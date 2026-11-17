package com.pejvak.app.ui.screens.notes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.ANY_DATE
import com.pejvak.app.domain.DatePreset
import com.pejvak.app.domain.DateRange
import com.pejvak.app.domain.isRangeActive
import com.pejvak.app.domain.presetRange
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Choosing a date range for the notes list. The quick answers apply and close;
 * custom dates arrive with the History screen in Phase 9, which shares this control.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NotesDateRangeSheet(
    range: DateRange,
    onApply: (DateRange) -> Unit,
    onClose: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val now = remember { System.currentTimeMillis() }
    val presets = listOf(
        DatePreset.Any to R.string.date_range_any,
        DatePreset.Today to R.string.date_range_today,
        DatePreset.Week to R.string.date_range_week,
        DatePreset.Month to R.string.date_range_month,
        DatePreset.Year to R.string.date_range_year,
    )

    GlassSheet(onDismiss = onClose, title = stringResource(R.string.date_range_title), icon = "time") {
        Column(
            modifier = Modifier.padding(bottom = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                presets.forEach { (preset, labelRes) ->
                    val next = presetRange(preset, now)
                    val selected = if (preset == DatePreset.Any) {
                        !isRangeActive(range)
                    } else {
                        next.from == range.from && next.to == range.to
                    }
                    GlassChip(
                        label = stringResource(labelRes),
                        selected = selected,
                        onClick = {
                            onApply(next)
                            onClose()
                        },
                    )
                }
            }
            Text(
                text = stringResource(R.string.date_range_note),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
            )
            if (isRangeActive(range)) {
                TextButton(onClick = { onApply(ANY_DATE); onClose() }) {
                    Text(
                        text = stringResource(R.string.date_range_clear),
                        color = tokens.textSecondary,
                    )
                }
            }
        }
    }
}
