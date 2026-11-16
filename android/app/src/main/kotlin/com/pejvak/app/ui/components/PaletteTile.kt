package com.pejvak.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.pejvak.app.domain.paletteIndexFor
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.tileRadius

/**
 * The per-track identity tile (DESING.md §9.4 / DS-15): a deterministic aurora ramp
 * from the contentHash with the title's initial, or the extracted artwork when one
 * exists. The same track paints the same gradient on every device, offline.
 */
@Composable
fun PaletteTile(
    contentHash: String?,
    label: String,
    modifier: Modifier = Modifier,
    artworkUrl: String? = null,
    size: Dp = 40.dp,
    radius: Dp = tileRadius(size),
) {
    val tokens = LocalPejvakTokens.current
    val ramp = AuroraRamps[paletteIndexFor(contentHash ?: label)]
    val shape = RoundedCornerShape(radius)
    Box(
        modifier = modifier.size(size).clip(shape),
        contentAlignment = Alignment.Center,
    ) {
        if (artworkUrl != null) {
            AsyncImage(
                model = artworkUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(shape),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(size)
                    .background(Brush.linearGradient(listOf(ramp.first, ramp.second, ramp.third))),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label.trim().firstOrNull()?.uppercase() ?: "·",
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.text,
                )
            }
        }
    }
}