package com.pejvak.app.ui.screens.player

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.AudioEnhancerSettings
import com.pejvak.app.domain.EnhancerRange
import com.pejvak.app.domain.TONES
import com.pejvak.app.domain.Track
import com.pejvak.app.domain.clampSeconds
import com.pejvak.app.domain.describeCredits
import com.pejvak.app.domain.digitsToSeconds
import com.pejvak.app.domain.formatClock
import com.pejvak.app.playback.SLEEP_TIMER_MINUTES
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.UserText
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.components.player.GainSliderRow
import com.pejvak.app.ui.components.player.LevelSliderRow
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.flow.StateFlow

@Composable
fun QueueSheet(
    tracks: List<Track>,
    currentIndex: Int,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.player_queue),
        subtitle = stringResource(R.string.player_queue_count, tracks.size),
        icon = "queue",
    ) {
        if (tracks.isEmpty()) {
            Text(
                text = stringResource(R.string.player_queue_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
            ) {
                // The queue may legitimately hold the same track twice ("add all to
                // queue" twice), so the key cannot be the track id alone — a repeated
                // key throws and takes the whole sheet down with it.
                itemsIndexed(items = tracks, key = { index, track -> "$index:${track.id}" }) { index, track ->
                    val selected = index == currentIndex
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(geo.radius.md))
                            .background(if (selected) tokens.glassFillStrong else Color.Transparent)
                            .clickable { onSelect(index) }
                            .padding(horizontal = geo.spacing.md, vertical = geo.spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (selected) {
                            Box(
                                Modifier.size(24.dp).clip(CircleShape).background(tokens.accent),
                                contentAlignment = Alignment.Center,
                            ) {
                                PejvakIcon(
                                    name = "play",
                                    contentDescription = null,
                                    tint = tokens.onAccent,
                                    size = geo.icons.xs,
                                )
                            }
                        } else {
                            Box(Modifier.width(24.dp), contentAlignment = Alignment.Center) {
                                Text(
                                    text = (index + 1).toString().padStart(2, '0'),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textTertiary,
                                )
                            }
                        }
                        Spacer(Modifier.width(geo.spacing.sm))
                        Column(Modifier.weight(1f)) {
                            UserText(
                                text = track.title,
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selected) tokens.text else tokens.text,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (track.durationSec > 0) {
                                Text(
                                    text = formatClock(track.durationSec),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textTertiary,
                                )
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.size(geo.spacing.xxl))
    }
}

@Composable
fun SleepTimerSheet(
    active: Boolean,
    remainingSec: Int?,
    onStart: (Int) -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var custom by remember { mutableStateOf("20") }
    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.player_sleep_title),
        icon = "sleep",
    ) {
        if (active && remainingSec != null) {
            Text(
                text = stringResource(R.string.player_sleep_pauses, formatClock(remainingSec)),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
            Spacer(Modifier.size(geo.spacing.md))
        }
        Text(
            text = stringResource(R.string.player_sleep_duration),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textSecondary,
        )
        Spacer(Modifier.size(geo.spacing.sm))
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
        ) {
            SLEEP_TIMER_MINUTES.forEach { minutes ->
                GlassChip(
                    label = "$minutes min",
                    icon = "timer",
                    onClick = {
                        onStart(minutes)
                        onDismiss()
                    },
                )
            }
        }
        Spacer(Modifier.size(geo.spacing.lg))
        OutlinedTextField(
            value = custom,
            onValueChange = { custom = it.filter(Char::isDigit).take(3) },
            label = { Text(stringResource(R.string.player_custom_minutes)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(geo.spacing.lg))
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(
                onClick = {
                    if (active) onCancel()
                    onDismiss()
                },
            ) {
                Text(stringResource(if (active) R.string.player_cancel_timer else R.string.player_close_action))
            }
            Spacer(Modifier.weight(1f))
            PrimaryButton(
                label = stringResource(R.string.player_start),
                onClick = {
                    onStart(custom.toIntOrNull()?.coerceIn(1, 180) ?: 20)
                    onDismiss()
                },
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.size(geo.spacing.xxl))
    }
}

@Composable
fun JumpToTimeSheet(
    position: StateFlow<Int>,
    durationSec: Int,
    onSeek: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val positionSec by position.collectAsStateWithLifecycle()
    var text by remember { mutableStateOf(formatClock(position.value)) }
    val seconds = clampSeconds(digitsToSeconds(text), durationSec)
    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.player_go_to_title),
        subtitle = formatClock(durationSec),
        icon = "time",
    ) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it.filter(Char::isDigit).take(6) },
            label = { Text(stringResource(R.string.player_timecode)) },
            supportingText = { Text(formatClock(seconds)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.size(geo.spacing.lg))
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel))
            }
            Spacer(Modifier.weight(1f))
            PrimaryButton(
                label = stringResource(R.string.player_go),
                onClick = {
                    onSeek(seconds)
                    onDismiss()
                },
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.size(geo.spacing.xxl))
    }
}

@Composable
fun AudioEnhancerSheet(
    settings: AudioEnhancerSettings,
    available: Boolean,
    unavailableReason: String?,
    toneLabel: String,
    onUpdate: (enabled: Boolean?, boostDb: Double?, bassDb: Double?, trebleDb: Double?) -> Unit,
    onOpenTones: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.player_enhancer_title),
        icon = "enhancer",
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.player_enhancer_enabled),
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.text,
                )
                Text(
                    text = stringResource(R.string.player_enhancer_body),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            Switch(checked = settings.enabled, onCheckedChange = { onUpdate(it, null, null, null) })
        }
        Spacer(Modifier.size(geo.spacing.md))
        GainSliderRow(
            label = stringResource(R.string.player_enhancer_boost),
            value = settings.boostDb,
            range = EnhancerRange.boostDb,
            onChange = { onUpdate(null, it, null, null) },
            icon = "equalizer",
        )
        GainSliderRow(
            label = stringResource(R.string.player_enhancer_bass),
            value = settings.bassDb,
            range = EnhancerRange.bassDb,
            onChange = { onUpdate(null, null, it, null) },
            icon = "volume",
        )
        GainSliderRow(
            label = stringResource(R.string.player_enhancer_treble),
            value = settings.trebleDb,
            range = EnhancerRange.trebleDb,
            onChange = { onUpdate(null, null, null, it) },
            icon = "music",
        )
        Spacer(Modifier.size(geo.spacing.sm))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            GlassChip(
                label = stringResource(R.string.player_enhancer_reset),
                icon = "refresh",
                onClick = { onUpdate(false, 0.0, 0.0, 0.0) },
            )
        }
        Spacer(Modifier.size(geo.spacing.sm))
        Text(
            text = if (available) stringResource(R.string.player_enhancer_hint) else stringResource(R.string.player_enhancer_unavailable),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textTertiary,
        )
        if (!available && unavailableReason != null) {
            Text(
                text = unavailableReason,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textTertiary,
            )
        }
        Spacer(Modifier.size(geo.spacing.lg))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(geo.radius.md))
                .background(tokens.glassFill)
                .clickable(onClick = onOpenTones)
                .padding(geo.spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            PejvakIcon(
                name = "music",
                contentDescription = null,
                tint = tokens.textSecondary,
                size = geo.icons.md,
            )
            // The row names the tone that is actually selected. It used to print
            // "Room tone" whatever you had chosen, so picking Forest changed nothing
            // visible here and the sheet looked stuck.
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.player_room_tone),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.textSecondary,
                )
                Text(
                    text = toneLabel,
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.text,
                )
            }
            PejvakIcon(
                name = "chevronRight",
                contentDescription = null,
                tint = tokens.textTertiary,
                size = geo.icons.md,
            )
        }
        Spacer(Modifier.size(geo.spacing.xxl))
    }
}

@Composable
fun TonePickerSheet(
    toneId: String,
    level: Int,
    onSelect: (String) -> Unit,
    onLevel: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.player_tone_title),
        subtitle = stringResource(R.string.player_tone_body),
        icon = "music",
    ) {
        LevelSliderRow(
            label = stringResource(R.string.player_tone_level),
            value = level,
            onChange = onLevel,
            icon = "volume",
        )
        Spacer(Modifier.size(geo.spacing.md))
        // Every tone gets its own crest rather than a radio dot: seven identical
        // circles said nothing about what you were choosing between.
        TONES.forEachIndexed { index, tone ->
            val selected = tone.id == toneId
            val shape = RoundedCornerShape(geo.radius.md)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(if (selected) tokens.glassFillStrong else Color.Transparent)
                    .then(
                        if (selected) Modifier.border(1.dp, tokens.accent.copy(alpha = 0.45f), shape)
                        else Modifier,
                    )
                    .clickable { onSelect(tone.id) }
                    .padding(horizontal = geo.spacing.sm, vertical = geo.spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
            ) {
                ToneWaveChip(index = index, selected = selected)
                Column(Modifier.weight(1f)) {
                    Text(tone.label, style = MaterialTheme.typography.bodyLarge, color = tokens.text)
                    Text(
                        text = tone.hint,
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (selected) {
                    Box(
                        Modifier.size(22.dp).clip(CircleShape).background(tokens.accent),
                        contentAlignment = Alignment.Center,
                    ) {
                        PejvakIcon(
                            name = "check",
                            contentDescription = null,
                            tint = tokens.onAccent,
                            size = geo.icons.xs,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.size(geo.spacing.md))
        Text(
            text = stringResource(R.string.player_tone_credits, describeCredits()),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textTertiary,
        )
        Spacer(Modifier.size(geo.spacing.xxl))
    }
}

/** A tone's own little sea: three crests whose shape is derived from its position. */
@Composable
private fun ToneWaveChip(index: Int, selected: Boolean, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val tint = if (selected) tokens.accent else tokens.textTertiary
    Box(
        modifier = modifier
            .size(geo.tiles.md)
            .clip(RoundedCornerShape(geo.radius.sm))
            .background(if (selected) tokens.accent.copy(alpha = 0.14f) else tokens.glassFill),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxWidth().height(18.dp)) {
            val cy = size.height / 2f
            // Four crest widths and three phases across the seven tones, so the chips
            // read as different water rather than as the same icon repeated.
            val wavelength = (14 + (index % 4) * 5).dp.toPx()
            val phase = index * 0.85f
            val scale = 1f + (index % 3) * 0.18f
            repeat(3) { strand ->
                drawPath(
                    path = wavePath(
                        from = 4.dp.toPx(),
                        to = size.width - 4.dp.toPx(),
                        cy = cy + (strand - 1) * 3.6.dp.toPx(),
                        amplitude = (2.4f - strand * 0.6f).dp.toPx() * scale,
                        wavelength = wavelength,
                        phase = strand * 0.9f + phase,
                        taper = 5.dp.toPx(),
                        variation = 0.5f,
                    ),
                    color = tint.copy(alpha = 0.32f + 0.2f * strand),
                    style = Stroke(width = 1.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
    }
}
