package com.pejvak.app.ui.screens.ai

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.AI_COMING_SOON_BODY
import com.pejvak.app.domain.AI_COMING_SOON_HEADLINE
import com.pejvak.app.domain.AI_FALLBACK_FEATURE
import com.pejvak.app.domain.AI_FEATURES
import com.pejvak.app.domain.AiFeature
import com.pejvak.app.domain.aiGlyphRamp
import com.pejvak.app.domain.aiGlyphStop
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.WAVE_WAVELENGTH_DP
import com.pejvak.app.ui.components.ai.AiBloom
import com.pejvak.app.ui.components.ai.AiGlyph
import com.pejvak.app.ui.components.rememberWavePhase
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled

/**
 * The AI catalogue as a sheet, so a row's AI button can show the tools where the
 * listener already is instead of throwing them onto another tab and losing their
 * place. It is the AI page's content in the app's own language: a hero mark sitting
 * on water, the four tools as rows, and the reason they are all still dark.
 *
 * Tapping a row opens [AiFeatureSheet] *on top of this one* — the catalogue stays
 * behind, so closing a description returns to the list rather than to nothing.
 */
@Composable
fun AiCatalogSheet(
    onDismiss: () -> Unit,
    onOpenFeature: (AiFeature) -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current

    GlassSheet(
        onDismiss = onDismiss,
        title = stringResource(R.string.ai_action),
        subtitle = stringResource(R.string.ai_overline),
        icon = "ai",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 470.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
        ) {
            AiSeaBand(feature = AI_FALLBACK_FEATURE, glyphSize = 58.dp, height = 96.dp)
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
                Text(
                    text = stringResource(R.string.ai_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = tokens.text,
                )
                Text(
                    text = stringResource(R.string.ai_lede),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                AI_FEATURES.forEach { feature ->
                    AiFeatureRow(feature = feature, onClick = { onOpenFeature(feature) })
                }
            }
            AiWhyPanel()
            Spacer(Modifier.size(geo.spacing.xs))
        }
    }
}

/**
 * One tool, described properly: what it does, and why it is not doing it yet. The
 * coming-soon copy is pinned above the description so the two can never be read as
 * a broken button.
 */
@Composable
fun AiFeatureSheet(
    feature: AiFeature,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current

    GlassSheet(
        onDismiss = onDismiss,
        title = feature.title,
        subtitle = feature.blurb,
        icon = feature.icon,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 430.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
        ) {
            AiSeaBand(feature = feature, glyphSize = 72.dp, height = 128.dp)
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
                Text(
                    text = AI_COMING_SOON_HEADLINE,
                    style = MaterialTheme.typography.headlineMedium,
                    color = tokens.text,
                )
                Text(
                    text = AI_COMING_SOON_BODY,
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                )
            }
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    Text(
                        text = stringResource(R.string.ai_what_it_will_do).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textTertiary,
                    )
                    Text(
                        text = feature.detail,
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.textSecondary,
                    )
                }
            }
            PrimaryButton(
                label = stringResource(R.string.ai_back_to_tools),
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The tool's own colour, picked from the same ramp the glyph uses. */
@Composable
private fun aiTint(feature: AiFeature): Color {
    val tokens = LocalPejvakTokens.current
    return AuroraRamps[aiGlyphRamp(feature, tokens.isDark)].toList()[aiGlyphStop(tokens.isDark)]
}

/**
 * The mark resting on water: three crests behind the glyph, the outer one brightest,
 * the inner two lagging behind it. The same curve the scrubber and the page sweep
 * draw, so the sheet belongs to the same sea. Motion is optional — with it off the
 * crests still draw, just without the drift.
 */
@Composable
private fun AiSeaBand(feature: AiFeature, glyphSize: Dp, height: Dp) {
    val motion = useMotionEnabled()
    val phase = rememberWavePhase(periodMillis = 5_200)
    val tint = aiTint(feature)
    Box(Modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val cy = size.height * 0.66f
            val amplitude = 3.2.dp.toPx()
            val wavelength = WAVE_WAVELENGTH_DP.dp.toPx()
            listOf(
                Triple(0.dp, 1f, 0.34f),
                Triple((-9).dp, 0.66f, 0.17f),
                Triple(11.dp, 0.46f, 0.11f),
            ).forEach { (offset, scale, alpha) ->
                drawPath(
                    path = wavePath(
                        from = 0f,
                        to = size.width,
                        cy = cy + offset.toPx(),
                        amplitude = amplitude * scale,
                        wavelength = wavelength,
                        phase = if (motion) phase else 0.7f,
                        taper = 30.dp.toPx(),
                        variation = 0.45f,
                    ),
                    color = tint.copy(alpha = alpha),
                    style = Stroke(width = 1.6.dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
        AiBloom(tint = tint, size = glyphSize * 1.9f)
        AiGlyph(feature = feature, size = glyphSize, hero = true)
    }
}

/**
 * One tool as a row: its mark, what it is, what it gives you, and a way in. The
 * trailing chevron is what makes it read as "there is more behind this" instead of
 * as a disabled switch.
 */
@Composable
private fun AiFeatureRow(feature: AiFeature, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val tint = aiTint(feature)
    val shape = RoundedCornerShape(geo.radius.md)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tokens.glassFill)
            .border(1.dp, tint.copy(alpha = 0.24f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = geo.spacing.md, vertical = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        AiGlyph(feature = feature, size = 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(geo.spacing.xxs)) {
            Text(
                text = feature.title,
                style = MaterialTheme.typography.titleSmall,
                color = tokens.text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = feature.blurb,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        SoonPill()
        PejvakIcon(
            name = "chevronRight",
            contentDescription = null,
            tint = tokens.textTertiary,
            size = geo.icons.sm,
        )
    }
}

/** The "not yet" badge, identical to the one on the AI page. */
@Composable
private fun SoonPill() {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(geo.radius.pill))
            .background(tokens.accent.copy(alpha = 0.18f))
            .padding(horizontal = geo.spacing.sm, vertical = 2.dp),
    ) {
        Text(
            text = stringResource(R.string.ai_soon).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.accent,
        )
    }
}

/**
 * Why none of the four are switched on. Shared by the AI page and the sheet so the
 * explanation can never be right in one place and stale in the other.
 */
@Composable
fun AiWhyPanel(modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassCard(modifier = modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
            Text(
                text = stringResource(R.string.ai_why_overline).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textTertiary,
            )
            Text(
                text = stringResource(R.string.ai_why_title),
                style = MaterialTheme.typography.headlineSmall,
                color = tokens.text,
            )
            Text(
                text = stringResource(R.string.ai_why_body),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
            ) {
                Box(Modifier.size(8.dp).background(tokens.textTertiary, CircleShape))
                Text(
                    text = stringResource(R.string.ai_status),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textTertiary,
                )
            }
        }
    }
}
