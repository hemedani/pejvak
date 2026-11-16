package com.pejvak.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Phase 0 placeholder for a tab destination. Renders a glass card over the ambient
 * canvas so the shell already speaks the design language. Each real screen replaces
 * its placeholder in the phase that owns it (see the plan).
 */
@Composable
fun PlaceholderScreen(title: String, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val shape = RoundedCornerShape(28.dp)
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .clip(shape)
                .background(tokens.glassFill)
                .border(1.dp, tokens.glassBorder, shape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = tokens.text,
            )
            Text(
                text = stringResource(R.string.skeleton_note),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}