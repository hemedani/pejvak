package com.pejvak.app.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import com.pejvak.app.core.isRtlText
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.Vazirmatn

/**
 * Renders user content with per-text direction (DESING.md §13): Persian/Arabic text
 * gets RTL layout + the bundled Vazirmatn font regardless of the surrounding LTR UI.
 * The UI itself stays English LTR.
 */
@Composable
fun UserText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = LocalPejvakTokens.current.text,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Ellipsis,
) {
    val rtl = isRtlText(text)
    val resolved = if (rtl) style.copy(fontFamily = Vazirmatn) else style
    CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        Text(
            text = text,
            modifier = modifier,
            style = resolved,
            color = color,
            maxLines = maxLines,
            overflow = overflow,
        )
    }
}