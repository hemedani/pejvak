package com.pejvak.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.toIntSize

/**
 * The shell's one recorded content layer. Screens mark their scroll body as the source;
 * the chrome panes draw that layer back blurred. No blur library is involved: a
 * [GraphicsLayer] records the body once per frame and the blur is [BlurEffect] applied to
 * that recorded layer — the same primitive as `Modifier.blur`.
 *
 * Putting the effect on the *layer* (not on each pane's Compose node) matters: a node that
 * carries a RenderEffect cannot draw a recorded RenderNode inside it on every renderer, and
 * the pane silently came out empty.
 */
@Stable
class Backdrop internal constructor(val layer: GraphicsLayer) {
    internal var sourceOrigin by mutableStateOf(Offset.Zero)
    internal var effectRadiusPx by mutableStateOf(0f)
}

/** Null outside the shell (e.g. the dev gallery), where panes draw the fallback tint. */
val LocalBackdrop = staticCompositionLocalOf<Backdrop?> { null }

@Composable
fun rememberBackdrop(): Backdrop {
    val layer = rememberGraphicsLayer()
    return remember(layer) { Backdrop(layer) }
}

/**
 * Marks this node's drawing as the backdrop. Call it on the scroll body only — a pane
 * inside the source would sample itself. The body itself keeps drawing sharp.
 */
fun Modifier.backdropSource(backdrop: Backdrop?): Modifier {
    if (backdrop == null) return this
    return this
        .onGloballyPositioned { coords ->
            val origin = coords.positionInRoot()
            if (backdrop.sourceOrigin != origin) backdrop.sourceOrigin = origin
        }
        .drawWithContent {
            val content = this
            backdrop.layer.record(size.toIntSize()) {
                content.drawContent()
            }
            content.drawContent()
        }
}

/**
 * Draws the recorded backdrop, blurred, into this node's bounds. The node is expected to
 * fill its pane; the parent clips it to the pane's shape.
 */
@Composable
fun BackdropBlur(
    backdrop: Backdrop,
    radius: Dp,
    modifier: Modifier = Modifier,
) {
    var paneOrigin by remember { mutableStateOf(Offset.Zero) }
    Box(
        modifier
            .onGloballyPositioned { coords ->
                val origin = coords.positionInRoot()
                if (paneOrigin != origin) paneOrigin = origin
            }
            .drawBehind {
                val radiusPx = radius.toPx()
                if (radiusPx <= 0f) return@drawBehind
                if (backdrop.effectRadiusPx != radiusPx) {
                    backdrop.layer.renderEffect =
                        BlurEffect(radiusPx, radiusPx, TileMode.Clamp)
                    backdrop.effectRadiusPx = radiusPx
                }
                translate(
                    left = backdrop.sourceOrigin.x - paneOrigin.x,
                    top = backdrop.sourceOrigin.y - paneOrigin.y,
                ) { drawLayer(backdrop.layer) }
            },
    )
}
