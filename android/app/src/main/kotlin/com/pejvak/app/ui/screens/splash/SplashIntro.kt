package com.pejvak.app.ui.screens.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.ui.components.AmbientCanvas
import com.pejvak.app.ui.components.HairlineWave
import com.pejvak.app.ui.components.WAVE_WAVELENGTH_DP
import com.pejvak.app.ui.components.drawWaveWake
import com.pejvak.app.ui.components.rememberWavePhase
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanSwellEasing
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlinx.coroutines.delay

/**
 * The branded intro (logomotion) that plays once on cold launch, after the system
 * splash hands off. It is the app's own metaphor, not a generic fade: the logo
 * surfaces from the water — a single crest rises and settles, a ripple ring blooms out
 * from where it lands, and the wordmark rises behind it on the same swell. Everything
 * is bounded (it runs once and calls [onFinish]); under reduced motion it settles to the
 * final frame with a brief hold instead.
 */
@Composable
fun SplashIntro(
    onFinish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()

    val rise = remember { Animatable(if (motion) 0f else 1f) }      // logo + crest surfacing
    val word = remember { Animatable(if (motion) 0f else 1f) }      // wordmark + rule
    val ring = remember { Animatable(if (motion) 0f else 1f) }      // ripple bloom
    val livePhase = rememberWavePhase(periodMillis = 5_200)

    LaunchedEffect(Unit) {
        if (motion) {
            rise.animateTo(1f, spring(dampingRatio = 0.78f, stiffness = 180f))
            ring.animateTo(1f, tween(620, easing = LinearEasing))
            word.animateTo(1f, tween(440, easing = OceanSwellEasing))
            delay(420)
        } else {
            rise.snapTo(1f)
            ring.snapTo(1f)
            word.snapTo(1f)
            delay(520)
        }
        onFinish()
    }

    val logoSize = 132.dp
    val corner = geo.radius.card

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvasBase),
    ) {
        AmbientCanvas()

        val density = LocalDensity.current
        val heightPx = with(density) { maxHeight.toPx() }
        // The horizon the logo settles on, and the crest that rises to meet it.
        val horizonY = heightPx * 0.42f
        val phase = if (motion) livePhase else 0.7f

        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val r = rise.value
            val cy = lerpF(heightPx * 0.86f, horizonY, r)
            val amp = 16.dp.toPx() * (0.35f + 0.65f * (1f - r))
            val wavelength = WAVE_WAVELENGTH_DP.dp.toPx() * 1.6f
            val crest = wavePath(
                from = 0f,
                to = size.width,
                cy = cy,
                amplitude = amp,
                wavelength = wavelength,
                phase = phase,
                taper = 48.dp.toPx(),
                variation = 0.3f,
            )
            drawPath(
                path = crest,
                color = tokens.accentTeal.copy(alpha = 0.55f * r),
                style = Stroke(width = 2.6.dp.toPx(), cap = StrokeCap.Round),
            )
            // Two wake strands flanking the centre crest, so it reads as a body moving
            // through water rather than a lone line.
            drawWaveWake(
                headX = size.width / 2f, cy = cy, spread = -7.dp.toPx(),
                phaseShift = 1.2f, amplitude = amp, phase = phase,
                color = tokens.accentTeal.copy(alpha = 0.4f * r), scale = 1f,
                lengthDp = 72f, wavelength = wavelength, alphaBase = 0.5f,
            )
            drawWaveWake(
                headX = size.width / 2f, cy = cy, spread = 5.dp.toPx(),
                phaseShift = -1.6f, amplitude = amp, phase = phase,
                color = tokens.accentTeal.copy(alpha = 0.4f * r), scale = 1f,
                lengthDp = 60f, wavelength = wavelength, alphaBase = 0.42f,
            )
            // Ripple bloom where the logo lands.
            val ringProgress = ring.value
            if (ringProgress > 0f && ringProgress < 1f) {
                val rad = lerpF(36.dp.toPx(), 150.dp.toPx(), ringProgress)
                drawCircle(
                    color = tokens.accentTeal.copy(alpha = (1f - ringProgress) * 0.5f),
                    radius = rad,
                    center = androidx.compose.ui.geometry.Offset(size.width / 2f, horizonY),
                    style = Stroke(width = 1.4.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }

        // Logo surfacing on the crest, with a soft glow behind it.
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxSize(),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Box(
                        modifier = Modifier
                            .size(300.dp)
                            .graphicsLayer { alpha = 0.6f * rise.value }
                            .background(
                                Brush.radialGradient(
                                    listOf(
                                        tokens.accentTeal.copy(alpha = 0.26f),
                                        Color.Transparent,
                                    ),
                                ),
                            ),
                    )
                    Image(
                        painter = painterResource(R.drawable.ic_launcher_art),
                        contentDescription = stringResource(R.string.app_name),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(logoSize)
                            .clip(RoundedCornerShape(corner))
                            .graphicsLayer {
                                alpha = rise.value
                                val s = 0.80f + 0.20f * rise.value
                                scaleX = s
                                scaleY = s
                                translationY = (1f - rise.value) * 40.dp.toPx()
                            },
                    )
                }
                // Wordmark + the same hairline crest the dock and sheets use.
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .padding(top = geo.spacing.xl)
                        .graphicsLayer {
                            alpha = word.value
                            translationY = (1f - word.value) * 16.dp.toPx()
                        },
                ) {
                    Text(
                        text = stringResource(R.string.app_name),
                        style = MaterialTheme.typography.displayLarge,
                        color = tokens.text,
                        modifier = Modifier.padding(horizontal = geo.spacing.xs),
                    )
                    HairlineWave(
                        phase = phase,
                        modifier = Modifier
                            .padding(top = geo.spacing.md)
                            .padding(horizontal = 48.dp)
                            .fillMaxWidth(),
                    )
                }
            }
        }
    }
}

private fun lerpF(start: Float, stop: Float, fraction: Float): Float = start + (stop - start) * fraction
