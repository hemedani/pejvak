package com.pejvak.app.ui.components.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.ANY_DATE
import com.pejvak.app.domain.DatePreset
import com.pejvak.app.domain.DateRange
import com.pejvak.app.domain.describeDateRange
import com.pejvak.app.domain.presetForRange
import com.pejvak.app.domain.presetRange
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/** The shared date filter (History and Notes): one chip per preset, Any clears it. */
@Composable
fun DateRangeSheet(
    range: DateRange,
    onDismiss: () -> Unit,
    onPick: (DateRange) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val active = presetForRange(range)
    GlassSheet(onDismiss = onDismiss, title = describeDateRange(range)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        ) {
            DatePreset.entries.filter { it != DatePreset.Custom }.forEach { preset ->
                val label = when (preset) {
                    DatePreset.Any -> stringResource(R.string.history_range_any)
                    DatePreset.Today -> stringResource(R.string.history_range_today)
                    DatePreset.Week -> stringResource(R.string.history_range_week)
                    DatePreset.Month -> stringResource(R.string.history_range_month)
                    DatePreset.Year -> stringResource(R.string.history_range_year)
                    DatePreset.Custom -> ""
                }
                GlassChip(
                    label = label,
                    selected = active == preset,
                    onClick = {
                        onPick(if (preset == DatePreset.Any) ANY_DATE else presetRange(preset))
                        onDismiss()
                    },
                )
            }
        }
    }
}
