package com.pejvak.app.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import com.pejvak.app.core.highlightRanges
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** Text with search hits highlighted (folded, index-aligned). */
@Composable
fun HighlightedText(
    text: String,
    query: String,
    modifier: Modifier = Modifier,
    color: Color = LocalPejvakTokens.current.text,
    maxLines: Int = Int.MAX_VALUE,
) {
    val ranges = remember(text, query) { highlightRanges(text, query) }
    HighlightedTextRanges(text = text, ranges = ranges, modifier = modifier, color = color, maxLines = maxLines)
}

/** Text with explicit search-hit ranges highlighted (already index-aligned). */
@Composable
fun HighlightedTextRanges(
    text: String,
    ranges: List<IntRange>,
    modifier: Modifier = Modifier,
    color: Color = LocalPejvakTokens.current.text,
    maxLines: Int = Int.MAX_VALUE,
    style: TextStyle? = null,
) {
    val tokens = LocalPejvakTokens.current
    val annotated = buildAnnotatedString {
        var cursor = 0
        for (range in ranges) {
            if (range.first > cursor) append(text.substring(cursor, range.first))
            withStyle(SpanStyle(background = tokens.accentTeal.copy(alpha = 0.35f), color = tokens.text)) {
                append(text.substring(range.first, range.last + 1))
            }
            cursor = range.last + 1
        }
        if (cursor < text.length) append(text.substring(cursor))
    }
    Text(
        text = annotated,
        modifier = modifier,
        style = style ?: LocalTextStyle.current,
        color = color,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}