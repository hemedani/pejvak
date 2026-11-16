package com.pejvak.app.ui.components.player

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatRemaining
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sin

data class ScrubberMarker(val id: String, val positionSec: Int, val color: Color?)

@Composable
fun Scrubber(
    positionSec: Int,
    durationSec: Int,
    markers: List<ScrubberMarker>,
    isPlaying: Boolean,
    waiting: Boolean,
    onSeek: (Int) -> Unit,
    onMarkerClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    var preview by remember { mutableStateOf<Float?>(null) }
    val base = if (durationSec > 0) (positionSec.toFloat() / durationSec).coerceIn(0f, 1f) else 0f
    // The player ticks once a second; a linear tween carries the playhead between
    // ticks so it glides instead of stepping. Seeks and pauses snap.
    val smooth by animateFloatAsState(
        targetValue = preview ?: base,
        animationSpec = if (motion && isPlaying && preview == null) tween(1000, easing = LinearEasing) else snap(),
        label = "scrubberProgress",
    )
    // While dragging, [smooth] snaps to the finger; on release the target equals the
    // last preview, so the playhead does not glide back across the seek.
    val progress = smooth
    val sweep = if (waiting && motion) rememberSweep() else 0.35f
    val amplitude by animateFloatAsState(
        targetValue = if (isPlaying && motion) 1f else 0f,
        animationSpec = tween(380),
        label = "waveAmplitude",
    )
    val phase = if (isPlaying && motion) rememberWavePhase() else 0f

    Column(modifier.fillMaxWidth()) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(geo.controls.lg)
                .pointerInput(durationSec, markers) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        var x = down.position.x
                        var horizontal = false
                        preview = fraction(x, size.width.toFloat())
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull() ?: break
                            if (!change.pressed) break
                            val dx = change.position.x - down.position.x
                            val dy = change.position.y - down.position.y
                            if (!horizontal) {
                                if (abs(dy) > viewConfiguration.touchSlop && abs(dy) > abs(dx)) {
                                    preview = null
                                    break
                                }
                                if (abs(dx) > viewConfiguration.touchSlop && abs(dx) > abs(dy)) horizontal = true
                            }
                            if (horizontal) {
                                x = change.position.x
                                preview = fraction(x, size.width.toFloat())
                                change.consume()
                            }
                        }
                        if (horizontal) {
                            val f = fraction(x, size.width.toFloat())
                            onSeek((f * durationSec).roundToInt())
                        } else if (preview != null) {
                            val f = fraction(x, size.width.toFloat())
                            val hit = nearestMarker(f, size.width.toFloat(), markers, durationSec, 14.dp.toPx())
                            if (hit != null) {
                                onMarkerClick(hit.id)
                            } else {
                                onSeek((f * durationSec).roundToInt())
                            }
                        }
                        preview = null
                    }
                },
        ) {
            val cy = size.height / 2f
            val thickness = 3.dp.toPx()
            val playedX = size.width * progress
            val waveAmplitude = 4.dp.toPx() * amplitude

            drawLine(
                color = tokens.glassBorder,
                start = Offset(0f, cy),
                end = Offset(size.width, cy),
                strokeWidth = thickness,
                cap = StrokeCap.Round,
            )

            if (waiting) {
                val band = size.width * 0.34f
                val left = (size.width + band) * sweep - band
                drawLine(
                    color = tokens.accent.copy(alpha = 0.55f),
                    start = Offset(left, cy),
                    end = Offset(left + band, cy),
                    strokeWidth = thickness * 2f,
                    cap = StrokeCap.Round,
                )
            } else {
                if (playedX > 0f) {
                    drawPath(
                        path = wavePath(playedX, cy, waveAmplitude, phase),
                        color = tokens.accent,
                        style = Stroke(width = thickness, cap = StrokeCap.Round),
                    )
                }
                drawCircle(tokens.accent.copy(alpha = 0.20f), 11.dp.toPx(), Offset(playedX, cy))
                drawCircle(tokens.accent, 6.dp.toPx(), Offset(playedX, cy))
            }

            if (durationSec > 0) {
                markers.forEach { marker ->
                    val x = size.width * fraction(marker.positionSec.toFloat(), durationSec.toFloat())
                    drawCircle(marker.color ?: tokens.accentTeal, 3.dp.toPx(), Offset(x, cy))
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatClock(positionSec), style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
            Text(formatRemaining(positionSec, durationSec), style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
        }
    }
}

@Composable
fun WavyProgress(
    progress: Float,
    isPlaying: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val smoothProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = if (motion && isPlaying) tween(1000, easing = LinearEasing) else snap(),
        label = "waveProgress",
    )
    val amplitude by animateFloatAsState(
        targetValue = if (isPlaying && motion) 1f else 0f,
        animationSpec = tween(380),
        label = "miniWaveAmplitude",
    )
    val phase = if (isPlaying && motion) rememberWavePhase() else 0f
    Canvas(modifier.fillMaxWidth().height(3.dp)) {
        val cy = size.height / 2f
        val playedX = size.width * smoothProgress.coerceIn(0f, 1f)
        drawLine(tokens.glassBorder, Offset(0f, cy), Offset(size.width, cy), 2.dp.toPx(), StrokeCap.Round)
        if (playedX > 0f) {
            drawPath(
                path = wavePath(playedX, cy, 1.5.dp.toPx() * amplitude, phase),
                color = tokens.accent,
                style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
            )
        }
    }
}

private fun nearestMarker(
    fraction: Float,
    width: Float,
    markers: List<ScrubberMarker>,
    durationSec: Int,
    hitSlopPx: Float,
): ScrubberMarker? {
    if (durationSec <= 0 || markers.isEmpty()) return null
    val nearest = markers.minByOrNull { abs(fractionOf(it.positionSec, durationSec) - fraction) } ?: return null
    val distance = abs(fractionOf(nearest.positionSec, durationSec) - fraction) * width
    return if (distance <= hitSlopPx) nearest else null
}

private fun fractionOf(positionSec: Int, durationSec: Int): Float =
    if (durationSec <= 0) 0f else (positionSec.toFloat() / durationSec.toFloat()).coerceIn(0f, 1f)

private fun fraction(value: Float, max: Float): Float = if (max <= 0f) 0f else (value / max).coerceIn(0f, 1f)

private fun wavePath(width: Float, cy: Float, amplitude: Float, phase: Float): Path {
    val path = Path()
    if (width <= 0f) return path
    val samples = 96
    for (i in 0..samples) {
        val t = i / samples.toFloat()
        val x = width * t
        val envelope = sin(PI * t).toFloat()
        val y = cy + sin(t * 6f * PI.toFloat() + phase) * amplitude * envelope
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    return path
}

@Composable
private fun rememberSweep(): Float {
    val transition = rememberInfiniteTransition(label = "scrub")
    val sweep by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2_400, easing = LinearEasing), RepeatMode.Restart),
        label = "sweep",
    )
    return sweep
}

@Composable
private fun rememberWavePhase(): Float {
    val transition = rememberInfiniteTransition(label = "wave")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 2f * PI.toFloat(),
        animationSpec = infiniteRepeatable(tween(2_000, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    return phase
}
