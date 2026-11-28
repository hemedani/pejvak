package com.pejvak.app.ui.components.field

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.pejvak.app.R
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** One choice in a [SelectField]: a stable [value], the text shown, and an optional detail line. */
data class SelectOption<out T>(
    val value: T,
    val label: String,
    val subtitle: String? = null,
)

/**
 * The app's one select box (DESING.md §9.3 — a choice, not a filter). It matches the
 * [TextField] track (inset glass, label above, accent ring when open) but is read-only:
 * a tap opens a [GlassSheet] of [SelectOption]s and the pick writes back through
 * [onSelect]. Enumerated inputs — folder, category, language — use this instead of a raw
 * text field so the creator cannot mistype a value the server would accept anyway.
 *
 * A [selected] value that is not in [options] still renders its own [rawSelectedLabel]
 * (when given), so a saved catalogue-less choice round-trips instead of reading as empty.
 */
@Composable
fun <T> SelectField(
    label: String,
    selected: T?,
    options: List<SelectOption<T>>,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    leadingIcon: String? = null,
    sheetTitle: String = label,
    sheetIcon: String? = leadingIcon,
    rawSelectedLabel: String? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val haptics = rememberHaptics()
    var open by remember { mutableStateOf(false) }

    val selectedOption = selected?.let { sel -> options.firstOrNull { it.value == sel } }
    val displayText = selectedOption?.label ?: rawSelectedLabel?.takeIf { it.isNotBlank() }
    val ringColor = when {
        error != null -> tokens.danger
        open -> tokens.accent
        else -> tokens.glassBorder
    }
    val ringWidth = if (open || error != null) 2.dp else 1.dp
    val shape = RoundedCornerShape(geo.radius.md)

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = tokens.textSecondary,
            modifier = Modifier.padding(bottom = geo.spacing.xs),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(tokens.glassFill, shape)
                .border(ringWidth, ringColor, shape)
                .clickable {
                    haptics.trigger(HapticIntent.Select)
                    open = true
                }
                .padding(horizontal = geo.spacing.md, vertical = geo.spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leadingIcon != null) {
                PejvakIcon(name = leadingIcon, contentDescription = null, tint = tokens.textTertiary, size = geo.icons.md)
                Spacer(Modifier.size(geo.spacing.sm))
            }
            Box(Modifier.weight(1f)) {
                if (displayText == null) {
                    Text(
                        text = placeholder ?: stringResource(R.string.select_none),
                        style = MaterialTheme.typography.bodyLarge,
                        color = tokens.textTertiary,
                    )
                } else {
                    Text(
                        text = displayText,
                        style = MaterialTheme.typography.bodyLarge,
                        color = tokens.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.size(geo.spacing.sm))
            PejvakIcon(name = "chevronDown", contentDescription = null, tint = tokens.textTertiary, size = geo.icons.md)
        }
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.danger,
                modifier = Modifier.padding(top = geo.spacing.xs),
            )
        }
    }

    if (open) {
        SelectSheet(
            title = sheetTitle,
            icon = sheetIcon,
            options = options,
            selected = selected,
            onPick = { value ->
                onSelect(value)
                open = false
            },
            onDismiss = { open = false },
        )
    }
}

@Composable
private fun <T> SelectSheet(
    title: String,
    icon: String?,
    options: List<SelectOption<T>>,
    selected: T?,
    onPick: (T) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(onDismiss = onDismiss, title = title, icon = icon) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 480.dp)
                .padding(bottom = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
        ) {
            items(options) { option ->
                val isSelected = option.value == selected
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(option.value) }
                        .padding(horizontal = geo.spacing.sm, vertical = geo.spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(option.label, style = MaterialTheme.typography.titleMedium, color = tokens.text)
                        if (!option.subtitle.isNullOrBlank()) {
                            Text(
                                text = option.subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.textSecondary,
                            )
                        }
                    }
                    if (isSelected) {
                        PejvakIcon(name = "check", contentDescription = null, tint = tokens.accentTeal, size = geo.icons.md)
                    }
                }
            }
        }
    }
}
