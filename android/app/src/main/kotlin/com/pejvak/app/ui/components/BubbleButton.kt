package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * A circular glass icon button (DESING.md §9.3). Outlined by default; [filled]
 * makes it the white primary-action bubble (play, selected nav). Touch target is
 * padded to at least 44 dp regardless of visual size.
 */
@Composable
fun BubbleButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    filled: Boolean = false,
    enabled: Boolean = true,
) {
    val tokens = LocalPejvakTokens.current
    val geometry = LocalPejvakGeometry.current
    val touch = maxOf(size, geometry.controls.lg)
    val glyphColor = if (filled) tokens.onAccent else tokens.text
    val interaction = remember { MutableInteractionSource() }
    val haptics = rememberHaptics()
    Box(
        modifier = modifier
            .size(touch)
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = ripple(bounded = true, color = tokens.text),
                enabled = enabled,
                onClick = {
                    haptics.trigger(HapticIntent.Tap)
                    onClick()
                },
            )
            .semantics { this.contentDescription = contentDescription ?: "" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .then(
                    if (filled) Modifier.background(tokens.accent)
                    else Modifier.background(tokens.glassFill).border(1.dp, tokens.glassBorder, CircleShape),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = glyphColor,
                modifier = Modifier.size(size * 0.46f),
            )
        }
    }
}