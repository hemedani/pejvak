package com.pejvak.app.ui.components.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.paletteIndexFor
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.UserText
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlin.math.roundToInt

@Composable
fun LevelSliderRow(
    label: String,
    value: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    icon: String? = null,
    max: Int = 100,
    valueLabel: String = "$value%",
    onLabelClick: (() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                PejvakIcon(name = icon, contentDescription = null, tint = tokens.textSecondary, size = geo.icons.sm)
                Spacer(Modifier.width(geo.spacing.xs))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.text,
                modifier = if (onLabelClick != null) Modifier.clickable(onClick = onLabelClick) else Modifier,
            )
            Spacer(Modifier.weight(1f))
            Text(valueLabel, style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
        }
        Slider(
            value = value.coerceIn(0, max).toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            valueRange = 0f..max.toFloat(),
            colors = SliderDefaults.colors(
                thumbColor = tokens.accent,
                activeTrackColor = tokens.accent,
                inactiveTrackColor = tokens.glassBorder,
                activeTickColor = Color.Transparent,
                inactiveTickColor = Color.Transparent,
            ),
        )
    }
}

@Composable
fun GainSliderRow(
    label: String,
    value: Double,
    range: com.pejvak.app.domain.GainRange,
    onChange: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    Column(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = tokens.text)
            Spacer(Modifier.weight(1f))
            Text(
                text = com.pejvak.app.domain.describeGainDb(value),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
        }
        val steps = (((range.max - range.min) / range.step).roundToInt() - 1).coerceAtLeast(0)
        Slider(
            value = value.coerceIn(range.min, range.max).toFloat(),
            onValueChange = { onChange(it.toDouble()) },
            valueRange = range.min.toFloat()..range.max.toFloat(),
            steps = steps,
            colors = SliderDefaults.colors(
                thumbColor = tokens.accent,
                activeTrackColor = tokens.accent,
                inactiveTrackColor = tokens.glassBorder,
                activeTickColor = Color.Transparent,
                inactiveTickColor = Color.Transparent,
            ),
        )
    }
}

@Composable
fun PlayerChipRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        content = content,
    )
}

@Composable
fun HeroArtwork(
    size: Dp,
    contentHash: String?,
    title: String,
    artworkUrl: String?,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val ramp = AuroraRamps[paletteIndexFor(contentHash ?: title)]
    val shape = RoundedCornerShape(geo.radius.lg)
    Box(
        modifier = modifier
            .size(size)
            .shadow(24.dp, shape, clip = false, ambientColor = ramp.second, spotColor = ramp.second)
            .border(1.dp, tokens.glassBorder, shape)
            .padding(5.dp),
    ) {
        PaletteTile(
            contentHash = contentHash,
            label = title,
            artworkUrl = artworkUrl,
            size = size - 10.dp,
            radius = geo.radius.lg - 4.dp,
        )
    }
}

@Composable
fun AnnotationList(
    annotations: List<Annotation>,
    onSelect: (Annotation) -> Unit,
    modifier: Modifier = Modifier,
    selectedId: String? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    if (annotations.isEmpty()) {
        Text(
            text = stringResource(R.string.player_no_notes),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textTertiary,
            modifier = modifier,
        )
        return
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
        annotations.forEach { note ->
            val selected = note.id == selectedId
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(geo.radius.md))
                    .background(if (selected) tokens.glassFillStrong else tokens.glassFill)
                    .clickable { onSelect(note) }
                    .padding(geo.spacing.md),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    Modifier
                        .padding(top = 5.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(markerColor(note.color, tokens.accentTeal)),
                )
                Spacer(Modifier.width(geo.spacing.sm))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = formatClock(note.positionSec),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textTertiary,
                    )
                    UserText(
                        text = note.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.text,
                        maxLines = 4,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (note.tags.isNotEmpty()) {
                        Text(
                            text = note.tags.joinToString(" \u00b7 "),
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.textSecondary,
                        )
                    }
                }
            }
        }
    }
}

fun markerColor(raw: String?, fallback: Color): Color {
    if (raw.isNullOrBlank()) return fallback
    return runCatching { Color(android.graphics.Color.parseColor(raw)) }.getOrDefault(fallback)
}
