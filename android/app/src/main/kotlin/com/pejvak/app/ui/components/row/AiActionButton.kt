package com.pejvak.app.ui.components.row

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS

/**
 * The AI verb on a row (AI-03). It opens the catalogue and deliberately carries no
 * identity: promising a transcription of *this* recording and then answering
 * "coming soon" would be two broken promises instead of one.
 */
@Composable
fun AiActionButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BubbleButton(
        icon = ICON_GLYPHS.getValue("ai"),
        contentDescription = stringResource(R.string.ai_action),
        onClick = onClick,
        modifier = modifier,
    )
}
