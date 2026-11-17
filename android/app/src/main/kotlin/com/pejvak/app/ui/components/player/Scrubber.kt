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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.formatRemaining
import com.pejvak.app.domain.sampleWaveform
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

data class ScrubberMarker(val id: String, val positionSec: Int, val color: Color?)

/**
 * The seek bar.
 *
 * Two layers carry the track: a **loudness strip** — one bar per RMS window of the
 * audio, measured by `WaveformAnalyzer` — and, over the played part, a single wave
 * with a **wake**: two strands fan out from the playhead, then fade, break into dots
 * and sink back into the one wave behind it. The wake is the movement; the strip is
 * the content.
 *
 * The playhead rides that wave rather than the axis — a body on the surface, not a pin
 * through the bar. The dock's `WavyProgress` draws the same thing at a smaller scale,
 * through the same `drawTrack`.
 */
@Composable
fun Scrubber(
    positionSec: Int,
    durationSec: Int,
    markers: List<ScrubberMarker>,
    isPlaying: Boolean,
    waiting: Boolean,
    waveform: FloatArray?,
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
    val waveActive = (isPlaying || waiting) && motion
    val amplitude by animateFloatAsState(
        targetValue = if (waveActive) 1f else 0f,
        animationSpec = tween(380),
        label = "waveAmplitude",
    )
    val phase = if (waveActive) rememberWavePhase() else 0f

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
            drawTrack(
                playedX = size.width * progress,
                cy = cy,
                amplitude = amplitude,
                phase = phase,
                waveform = waveform,
                waiting = waiting,
                accent = tokens.accent,
                border = tokens.glassBorder,
                scale = 1f,
            )

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
    waiting: Boolean = false,
    waveform: FloatArray? = null,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val smoothProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = if (motion && isPlaying) tween(1000, easing = LinearEasing) else snap(),
        label = "waveProgress",
    )
    val waveActive = (isPlaying || waiting) && motion
    val amplitude by animateFloatAsState(
        targetValue = if (waveActive) 1f else 0f,
        animationSpec = tween(380),
        label = "miniWaveAmplitude",
    )
    val phase = if (waveActive) rememberWavePhase() else 0f
    // The dock carries the scrubber's whole design — loudness strip, wake and riding
    // playhead — at MINI_SCALE. It needs real headroom: the bars reach ±5 dp and the
    // halo ±7 dp, so a 9 dp canvas would clip the crests into a smear.
    Canvas(modifier.fillMaxWidth().height(MINI_HEIGHT)) {
        drawTrack(
            playedX = size.width * smoothProgress.coerceIn(0f, 1f),
            cy = size.height / 2f,
            amplitude = amplitude,
            phase = phase,
            waveform = waveform,
            waiting = waiting,
            accent = tokens.accent,
            border = tokens.glassBorder,
            scale = MINI_SCALE,
        )
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

/** A crest-to-crest span long enough to read as water rather than as a saw. */
private val WAVE_WAVELENGTH = 64.dp

/** How tall the played wave stands. */
private val WAVE_AMPLITUDE = 3.0.dp

/** How thick the played wave is drawn. */
private val WAVE_STROKE = 3.dp

/** The playhead: a solid dot with a soft halo, so it reads as a body on the surface. */
private val HEAD_DOT = 5.5.dp
private val HEAD_HALO = 9.dp

/**
 * The dock's bar is the same design at [MINI_SCALE]. Every dimension is derived from
 * the scrubber's, so the two can never drift apart into two different looks.
 */
private const val MINI_SCALE = 0.55f

/** Tall enough for the mini bars (±5 dp) and the halo (±7 dp) to breathe. */
private val MINI_HEIGHT = 14.dp

/** Bar geometry of the loudness strip. */
private val BAR_WIDTH = 1.8.dp
private val BAR_PITCH = 4.4.dp
private val BAR_HEIGHT = 9.dp

/** How far the wake reaches back from the playhead before it is gone. */
private val WAKE_LENGTH = 190.dp
/** How far the two side strands sit from the centre wave at the playhead. */
private val WAKE_SPREAD = 10.5.dp
/** Extra phase the side strands carry at the playhead, in radians (~86°). */
private const val WAKE_PHASE = 1.5f
private const val WAKE_ALPHA = 0.62f
/** The strands ripple less than the wave they ride on, so they stay readable. */
private const val WAKE_AMPLITUDE_SCALE = 0.35f

/**
 * The whole track, drawn once and used at two sizes: the scrubber at `scale = 1f`,
 * the dock's mini-player at [MINI_SCALE].
 *
 * Order matters — the loudness strip is the content and goes down first, the wake is
 * the movement and goes over it, and the played wave goes last so the one wave the
 * wake converges into stays on top of its own ripples.
 */
private fun DrawScope.drawTrack(
    playedX: Float,
    cy: Float,
    amplitude: Float,
    phase: Float,
    waveform: FloatArray?,
    waiting: Boolean,
    accent: Color,
    border: Color,
    scale: Float,
) {
    val waveAmplitude = WAVE_AMPLITUDE.toPx() * scale * amplitude
    val wavelength = WAVE_WAVELENGTH.toPx() * scale

    drawWaveformBars(
        values = waveform,
        playedX = playedX,
        cy = cy,
        played = accent.copy(alpha = 0.92f),
        resting = accent.copy(alpha = 0.17f),
        empty = border,
        scale = scale,
    )

    if (waiting) {
        // A slow travelling wave while the source is being resolved or buffered: the
        // same language as the playing wave, at lower contrast, without a playhead.
        drawPath(
            path = wavePath(
                from = 0f,
                to = size.width,
                cy = cy,
                amplitude = waveAmplitude,
                wavelength = wavelength,
                phase = phase,
                taper = 24.dp.toPx() * scale,
                variation = 0.25f,
            ),
            color = accent.copy(alpha = 0.55f),
            style = Stroke(width = WAVE_STROKE.toPx() * scale, cap = StrokeCap.Round),
        )
        return
    }
    if (playedX <= 0f) return

    // The wake first, so the one wave it converges into stays on top. The two strands
    // are deliberately *not* mirror images — different reach, different phase —
    // because a mirrored pair closes into a lens that reads as an outline, not as two
    // ripples on water.
    //
    // Paused, the amplitude animates to zero and the wake would freeze into three flat
    // dashed rules; it belongs to the motion, so it goes with it.
    if (amplitude > 0.01f) {
        drawWakeStrand(
            headX = playedX, cy = cy, spread = -WAKE_SPREAD.toPx() * scale,
            phaseShift = WAKE_PHASE, amplitude = waveAmplitude, phase = phase,
            color = accent, scale = scale,
        )
        drawWakeStrand(
            headX = playedX, cy = cy, spread = WAKE_SPREAD.toPx() * 0.8f * scale,
            phaseShift = -WAKE_PHASE * 1.45f, amplitude = waveAmplitude, phase = phase,
            color = accent, scale = scale,
        )
    }

    val taper = 12.dp.toPx() * scale
    drawPath(
        path = wavePath(
            from = 0f,
            to = playedX,
            cy = cy,
            amplitude = waveAmplitude,
            wavelength = wavelength,
            phase = phase,
            taper = taper,
            variation = PLAYED_VARIATION,
            // The playhead end is not tapered: the crest there is what the eye
            // follows, and the dot masks the cut anyway.
            taperEnd = 0f,
        ),
        color = accent,
        style = Stroke(width = WAVE_STROKE.toPx() * scale, cap = StrokeCap.Round),
    )

    // The playhead rides the wave instead of sitting on the axis: it is a body on the
    // surface, not a pin stuck through the bar. Same curve, same phase, same taper as
    // the path above, so it is always exactly on the line.
    val headFade = ramp(playedX, min(taper, playedX / 2f))
    val headY = cy + headFade * waveOffsetAt(playedX, waveAmplitude, wavelength, phase, PLAYED_VARIATION)
    drawCircle(accent.copy(alpha = 0.14f), HEAD_HALO.toPx() * scale, Offset(playedX, headY))
    drawCircle(accent, HEAD_DOT.toPx() * scale, Offset(playedX, headY))
}

/** Height modulation of the played wave; shared by the path and the playhead. */
private const val PLAYED_VARIATION = 0.2f

/**
 * The loudness strip: one vertical bar per window, the played ones lit and the rest
 * faded. Bars come from the measured waveform when there is one; without it (a
 * stream, a file the platform will not decode, or the moment before the analysis
 * lands) the strip degrades to a plain track line rather than to nothing.
 */
private fun DrawScope.drawWaveformBars(
    values: FloatArray?,
    playedX: Float,
    cy: Float,
    played: Color,
    resting: Color,
    empty: Color,
    scale: Float,
) {
    if (values == null || values.isEmpty()) {
        drawLine(empty, Offset(0f, cy), Offset(size.width, cy), 2.dp.toPx() * scale, StrokeCap.Round)
        return
    }
    val pitch = BAR_PITCH.toPx() * scale
    val count = max(2, (size.width / pitch).toInt())
    val bars = sampleWaveform(values, count)
    val width = BAR_WIDTH.toPx() * scale
    val half = BAR_HEIGHT.toPx() * scale
    // Centre the strip so the bars do not end on a clipped half-gap.
    val start = (size.width - count * pitch) / 2f + pitch / 2f
    for (index in 0 until count) {
        val x = start + index * pitch
        val reach = half * bars[index]
        drawLine(
            color = if (x <= playedX) played else resting,
            start = Offset(x, cy - reach),
            end = Offset(x, cy + reach),
            strokeWidth = width,
            cap = StrokeCap.Round,
        )
    }
}

/**
 * One strand of the wake — the fish's ripple running back from the playhead.
 *
 * The strand carries its own phase offset ([WAKE_PHASE]) as well as a vertical offset
 * ([WAKE_SPREAD]), and *both* decay with distance. That combination is the whole
 * trick: with only an offset the strands run parallel to the centre wave and read as
 * a grey shadow of it, but with a phase offset they are genuinely different waves at
 * the playhead — two flanking ripples and the one in the middle — and as the phase
 * unwinds they lock back into step and merge into that middle wave.
 *
 * Three decays, on three schedules:
 * - **Opacity** falls slowly (`near^0.8`), so the strands stay legible into the tail and
 *   the merge at the end is soft rather than a visible junction.
 * - **Dash length** collapses (`near^2.2`, ~9 dp → 0.6 dp) while the gaps widen, so
 *   a continuous ripple near the playhead turns into a dotted trail behind it.
 * - **Offset and phase** hold their width through most of the wake (an ease-out
 *   `1-(1-near)^2`) and only close near the tail, so the fan reads as ripples running
 *   out of energy rather than as a bracket drawn around the playhead.
 */
private fun DrawScope.drawWakeStrand(
    headX: Float,
    cy: Float,
    spread: Float,
    phaseShift: Float,
    amplitude: Float,
    phase: Float,
    color: Color,
    scale: Float,
) {
    val length = min(WAKE_LENGTH.toPx() * scale, headX)
    if (length <= 1f) return
    val k = (2f * PI / (WAVE_WAVELENGTH.toPx() * scale)).toFloat()
    val dashLong = 9.dp.toPx() * scale
    val dashShort = 0.6.dp.toPx() * scale
    val gapTight = 2.6.dp.toPx() * scale
    val gapWide = 6.5.dp.toPx() * scale
    val offsetMax = spread
    val thin = 1.dp.toPx() * scale
    val thick = 1.5.dp.toPx() * scale

    var travelled = 0f
    while (travelled < length) {
        val near = 1f - (travelled / length).coerceIn(0f, 1f)
        val alpha = WAKE_ALPHA * near.pow(0.8f)
        if (alpha < 0.035f) break
        val dotted = near * near
        val dash = dashShort + (dashLong - dashShort) * near.pow(2.2f)
        val gap = gapWide - (gapWide - gapTight) * dotted
        val x0 = headX - travelled
        val x1 = (x0 - dash).coerceAtLeast(0f)
        if (x1 >= x0) break
        // The fan holds its width for most of the wake and closes near the tail, so it
        // reads as ripples running out of energy rather than as a bracket drawn round
        // the playhead.
        val close = 1f - (1f - near) * (1f - near)
        val offset = offsetMax * close
        val shift = phaseShift * near.pow(1.2f)
        drawLine(
            color = color.copy(alpha = alpha),
            start = Offset(x0, cy + offset + sin(x0 * k + phase + shift) * amplitude * WAKE_AMPLITUDE_SCALE),
            end = Offset(x1, cy + offset + sin(x1 * k + phase + shift) * amplitude * WAKE_AMPLITUDE_SCALE),
            strokeWidth = thin + (thick - thin) * near,
            cap = StrokeCap.Round,
        )
        travelled += dash + gap
    }
}

/**
 * A sine along `y = cy` between [from] and [to].
 *
 * The wavelength is absolute, never a fraction of the drawn width: tying the
 * frequency to the filled part of the bar made the first seconds a tight scribble
 * and the last stretch a near-straight line. [variation] gently modulates the height
 * along x so no two crests are identical, and [taper] fades both ends into the
 * baseline so the stroke never starts or stops with a vertical jump.
 */
private fun wavePath(
    from: Float,
    to: Float,
    cy: Float,
    amplitude: Float,
    wavelength: Float,
    phase: Float,
    taper: Float,
    variation: Float,
    taperEnd: Float = taper,
): Path {
    val path = Path()
    val span = to - from
    if (span <= 0f) return path
    if (amplitude <= 0f || wavelength <= 0f) {
        path.moveTo(from, cy)
        path.lineTo(to, cy)
        return path
    }
    val steps = max(2, (span / (wavelength / 6f)).roundToInt())
    val edgeStart = min(taper, span / 2f)
    val edgeEnd = min(taperEnd, span / 2f)
    for (i in 0..steps) {
        val x = from + span * (i / steps.toFloat())
        val fade = ramp(x - from, edgeStart) * ramp(to - x, edgeEnd)
        val y = cy + fade * waveOffsetAt(x, amplitude, wavelength, phase, variation)
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    return path
}

/**
 * The wave's vertical offset at [x], excluding any taper.
 *
 * This is the *only* place the curve is evaluated, so anything that needs to sit on
 * the wave — the playhead, most importantly — gets the same answer the path got and
 * cannot drift out of step with it.
 */
private fun waveOffsetAt(
    x: Float,
    amplitude: Float,
    wavelength: Float,
    phase: Float,
    variation: Float,
): Float {
    val k = (2f * PI / wavelength).toFloat()
    val breatheK = (2f * PI / (wavelength * 5f)).toFloat()
    val breathe = 1f + variation * sin(x * breatheK + phase * 0.6f)
    return sin(x * k + phase) * amplitude * breathe
}

/** Smooth 0→1 over [edge]: the wave grows out of the baseline instead of jumping. */
private fun ramp(distance: Float, edge: Float): Float {
    if (edge <= 0f) return 1f
    val t = (distance / edge).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

@Composable
private fun rememberWavePhase(): Float {
    val transition = rememberInfiniteTransition(label = "wave")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 2f * PI.toFloat(),
        animationSpec = infiniteRepeatable(tween(3_800, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    return phase
}
