package com.pejvak.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.CollectionSort
import com.pejvak.app.domain.SortDirection
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/** Direction glyph for a chip; shuffle has no direction, so it carries none. */
fun sortDirectionArrow(sort: CollectionSort, direction: SortDirection): String = when {
    sort == CollectionSort.Shuffle -> ""
    direction == SortDirection.Desc -> " \u2193"
    else -> " \u2191"
}

@Composable
fun sortOptionLabel(sort: CollectionSort): String = stringResource(
    when (sort) {
        CollectionSort.Folder -> R.string.sort_option_folder
        CollectionSort.Source -> R.string.sort_option_source
        CollectionSort.Name -> R.string.sort_option_name
        CollectionSort.Duration -> R.string.sort_option_duration
        CollectionSort.Shuffle -> R.string.sort_option_shuffle
        CollectionSort.Manual -> R.string.sort_option_manual
        CollectionSort.Smart -> R.string.sort_option_smart
        CollectionSort.CreatedAt -> R.string.sort_option_created
        CollectionSort.Unknown -> R.string.sort_option_unknown
    },
)

@Composable
fun sortChipLabel(sort: CollectionSort, direction: SortDirection): String =
    sortOptionLabel(sort) + sortDirectionArrow(sort, direction)

/** The shared sort sheet: one pick per order, plus Asc/Desc unless shuffling. */
@Composable
fun CollectionSortSheet(
    options: List<CollectionSort>,
    sort: CollectionSort,
    direction: SortDirection,
    onDismiss: () -> Unit,
    onSelect: (CollectionSort, SortDirection) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    GlassSheet(onDismiss = onDismiss, title = stringResource(R.string.sort_title), icon = "sort") {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                options.forEach { option ->
                    GlassChip(
                        label = sortOptionLabel(option),
                        selected = option == sort,
                        icon = "sort",
                        onClick = {
                            onSelect(option, if (option == CollectionSort.Shuffle) SortDirection.Asc else direction)
                        },
                    )
                }
            }
            if (sort != CollectionSort.Shuffle) {
                SegmentedControl(
                    options = listOf(
                        stringResource(R.string.sort_ascending),
                        stringResource(R.string.sort_descending),
                    ),
                    selectedIndex = if (direction == SortDirection.Desc) 1 else 0,
                    onSelect = { index ->
                        onSelect(sort, if (index == 1) SortDirection.Desc else SortDirection.Asc)
                    },
                )
            }
        }
    }
}
