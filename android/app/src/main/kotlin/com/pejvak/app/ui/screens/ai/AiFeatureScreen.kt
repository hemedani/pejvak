package com.pejvak.app.ui.screens.ai

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.AI_COMING_SOON_BODY
import com.pejvak.app.domain.AI_COMING_SOON_HEADLINE
import com.pejvak.app.domain.AI_FALLBACK_FEATURE
import com.pejvak.app.domain.aiFeatureFor
import com.pejvak.app.domain.aiGlyphRamp
import com.pejvak.app.domain.aiGlyphStop
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.ScreenHeader
import com.pejvak.app.ui.components.ai.AiGlyph
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * One tool before it exists: the pinned coming-soon message as headline + body,
 * then what the tool would have done, then a way back. An unknown id lands on the
 * honest "AI tools" fallback (mirrors mobile/src/app/ai/[feature].tsx).
 */
@Composable
fun AiFeatureScreen(
    featureId: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val feature = aiFeatureFor(featureId) ?: AI_FALLBACK_FEATURE
    val tint = AuroraRamps[aiGlyphRamp(feature, tokens.isDark)].toList()[aiGlyphStop(tokens.isDark)]

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = geo.spacing.xl, vertical = geo.spacing.xl),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.xxl),
    ) {
        ScreenHeader(
            overline = stringResource(R.string.ai_overline),
            title = feature.title,
            action = {
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("back"),
                    contentDescription = stringResource(R.string.back),
                    onClick = onBack,
                )
            },
        )

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            Box(Modifier.size(232.dp), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(232.dp)
                        .border(1.dp, tint.copy(alpha = 0.10f), CircleShape),
                )
                Box(
                    Modifier
                        .size(168.dp)
                        .border(1.dp, tint.copy(alpha = 0.20f), CircleShape),
                )
                AiGlyph(feature = feature, size = 104.dp, hero = true)
            }
            Text(
                text = AI_COMING_SOON_HEADLINE,
                style = MaterialTheme.typography.displayLarge,
                color = tokens.text,
                textAlign = TextAlign.Center,
            )
            Text(
                text = AI_COMING_SOON_BODY,
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 320.dp),
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

        PrimaryButton(label = stringResource(R.string.ai_back_to_tools), onClick = onBack)
        Spacer(Modifier.size(geo.spacing.sm))
    }
}
