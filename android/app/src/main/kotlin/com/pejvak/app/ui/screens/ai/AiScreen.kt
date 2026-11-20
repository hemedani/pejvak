package com.pejvak.app.ui.screens.ai

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.AI_FEATURES
import com.pejvak.app.domain.AI_FALLBACK_FEATURE
import com.pejvak.app.domain.AiFeature
import com.pejvak.app.domain.aiGlyphRamp
import com.pejvak.app.domain.aiGlyphStop
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.ai.AiBloom
import com.pejvak.app.ui.components.ai.AiGlyph
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.OceanCascade
import com.pejvak.app.ui.theme.oceanEntrance

/**
 * The AI catalogue: four tools, each visibly pending, with the reason stated once
 * at the bottom. The grid is two explicit rows of two so the cards cannot disagree
 * in width (mirrors mobile/src/app/(tabs)/ai.tsx).
 */
@Composable
fun AiScreen(
    onOpenTool: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val rows = listOf(AI_FEATURES.take(2), AI_FEATURES.drop(2))

    OceanCascade {
        Column(
            modifier = modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = geo.spacing.xl, vertical = geo.spacing.xl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.xxl),
        ) {
            Hero(modifier = Modifier.oceanEntrance(0, swayDp = 0.dp))
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                rows.forEachIndexed { rowIdx, row ->
                    Row(
                        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                    ) {
                        row.forEachIndexed { colIdx, feature ->
                            FeatureCard(
                                feature = feature,
                                onClick = { onOpenTool(feature.id.wire) },
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .oceanEntrance(1 + rowIdx * 2 + colIdx),
                            )
                        }
                    }
                }
            }
            AiWhyPanel(modifier = Modifier.oceanEntrance(1 + AI_FEATURES.size, swayDp = 0.dp))
            Spacer(Modifier.size(geo.spacing.sm))
        }
    }
}

@Composable
private fun Hero(modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val tint = AuroraRamps[aiGlyphRamp(AI_FALLBACK_FEATURE, tokens.isDark)].toList()[aiGlyphStop(tokens.isDark)]
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
        Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) {
            AiBloom(tint = tint, size = 120.dp)
            AiGlyph(feature = AI_FALLBACK_FEATURE, size = 72.dp, hero = true)
        }
        Text(
            text = stringResource(R.string.ai_overline).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.textTertiary,
        )
        Text(
            text = stringResource(R.string.ai_title),
            style = MaterialTheme.typography.displayLarge,
            color = tokens.text,
        )
        Text(
            text = stringResource(R.string.ai_lede),
            style = MaterialTheme.typography.bodyLarge,
            color = tokens.textSecondary,
        )
    }
}

@Composable
private fun FeatureCard(
    feature: AiFeature,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val tint = AuroraRamps[aiGlyphRamp(feature, tokens.isDark)].toList()[aiGlyphStop(tokens.isDark)]
    GlassCard(
        modifier = modifier
            .clip(RoundedCornerShape(geo.radius.card))
            .border(1.dp, tint.copy(alpha = 0.34f), RoundedCornerShape(geo.radius.card))
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                AiGlyph(feature = feature, size = 44.dp)
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
            Text(
                text = feature.title,
                style = MaterialTheme.typography.titleMedium,
                color = tokens.text,
            )
            Text(
                text = feature.blurb,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textTertiary,
            )
        }
    }
}
