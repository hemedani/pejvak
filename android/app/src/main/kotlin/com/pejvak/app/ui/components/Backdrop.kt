package com.pejvak.app.ui.components

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect as AndroidRenderEffect
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.CompositingStrategy
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.node.requireGraphicsContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.toIntSize
import kotlin.math.ceil

private const val BACKDROP_SAMPLE_SCALE = 0.5f
private const val BACKDROP_SATURATION_BOOST = 1.22f

/**
 * Multi-source backdrop coordinator for crystalline glass chrome (`GlassHeader`,
 * `AppDock`, `StandaloneMiniPlayer`).
 *
 * Background sources (`AmbientCanvas` at `zIndex = 0f` and each screen's scroll body at
 * `zIndex = 1f`) record their sharp content into unblurred [GraphicsLayer]s inside a
 * [DrawModifierNode]. When any Compose snapshot applies (list scroll, pager swipe,
 * ambient animation, search expand), attached sources and consumers invalidate at the
 * draw phase only with zero recomposition or relayout. Each glass pane composites only
 * the region behind it into a small, 0.5× downscaled, offscreen [GraphicsLayer] with
 * hardware [RenderEffect] blur + vibrancy (API 31+).
 */
@Stable
class Backdrop internal constructor() {
    internal val sources = linkedSetOf<BackdropSourceNode>()
    internal val consumers = linkedSetOf<BackdropBlurNode>()
    internal var paused: Boolean = false
        set(value) {
            if (field != value) {
                field = value
                if (!value) invalidateAll()
            }
        }

    internal fun orderedSources(): List<BackdropSourceNode> =
        sources.sortedBy { it.zIndex }

    internal fun invalidateConsumers() {
        consumers.forEach { node ->
            if (node.isAttached) node.invalidateDraw()
        }
    }

    internal fun invalidateAll() {
        if (paused || consumers.isEmpty()) return
        sources.forEach { node ->
            if (node.isAttached) node.invalidateDraw()
        }
        consumers.forEach { node ->
            if (node.isAttached) node.invalidateDraw()
        }
    }
}

/** Null outside the shell (or on preview paths without a backdrop). */
val LocalBackdrop = staticCompositionLocalOf<Backdrop?> { null }

@Composable
fun rememberBackdrop(): Backdrop {
    val backdrop = remember { Backdrop() }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    DisposableEffect(backdrop) {
        val handle = Snapshot.registerApplyObserver { _, _ ->
            if (backdrop.paused || backdrop.consumers.isEmpty()) return@registerApplyObserver
            if (Looper.myLooper() == Looper.getMainLooper()) {
                backdrop.invalidateAll()
            } else {
                mainHandler.post { backdrop.invalidateAll() }
            }
        }
        onDispose { handle.dispose() }
    }
    return backdrop
}

/**
 * Registers this composable's drawing as a backdrop source at [zIndex]. Content continues
 * rendering sharp on screen while its unblurred layer is available to sibling glass panes.
 */
fun Modifier.backdropSource(
    backdrop: Backdrop?,
    zIndex: Float = 1f,
): Modifier = if (backdrop == null) {
    this
} else {
    this then BackdropSourceElement(backdrop = backdrop, zIndex = zIndex)
}

internal class BackdropSourceNode(
    var backdrop: Backdrop,
    var zIndex: Float,
) : Modifier.Node(), DrawModifierNode, GlobalPositionAwareModifierNode {
    var layer: GraphicsLayer? = null
        private set
    var originInRoot: Offset = Offset.Zero
        private set

    override fun onAttach() {
        super.onAttach()
        attachToBackdrop()
    }

    override fun onDetach() {
        detachFromBackdrop()
        layer?.let {
            requireGraphicsContext().releaseGraphicsLayer(it)
            layer = null
        }
        super.onDetach()
    }

    internal fun attachToBackdrop() {
        backdrop.sources.add(this)
        backdrop.invalidateConsumers()
    }

    internal fun detachFromBackdrop() {
        backdrop.sources.remove(this)
        backdrop.invalidateConsumers()
    }

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        if (!coordinates.isAttached) return
        val origin = coordinates.positionInRoot()
        if (originInRoot != origin) {
            originInRoot = origin
            backdrop.invalidateConsumers()
        }
    }

    override fun ContentDrawScope.draw() {
        if (!backdrop.paused && size.width >= 1f && size.height >= 1f) {
            val target = layer ?: requireGraphicsContext().createGraphicsLayer().also { layer = it }
            target.record(size.toIntSize()) {
                this@draw.drawContent()
            }
            drawLayer(target)
        } else {
            drawContent()
        }
    }
}

private class BackdropSourceElement(
    private val backdrop: Backdrop,
    private val zIndex: Float,
) : ModifierNodeElement<BackdropSourceNode>() {
    override fun create(): BackdropSourceNode = BackdropSourceNode(backdrop, zIndex)

    override fun update(node: BackdropSourceNode) {
        if (node.backdrop !== backdrop) {
            node.detachFromBackdrop()
            node.backdrop = backdrop
            node.zIndex = zIndex
            node.attachToBackdrop()
        } else if (node.zIndex != zIndex) {
            node.zIndex = zIndex
            node.backdrop.invalidateConsumers()
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is BackdropSourceElement) return false
        return backdrop === other.backdrop && zIndex == other.zIndex
    }

    override fun hashCode(): Int = 31 * backdrop.hashCode() + zIndex.hashCode()
}

internal class BackdropBlurNode(
    var backdrop: Backdrop,
    var radius: Dp,
) : Modifier.Node(), DrawModifierNode, GlobalPositionAwareModifierNode {
    private var effectLayer: GraphicsLayer? = null
    private var paneOriginInRoot: Offset = Offset.Zero
    private var cachedSigma: Float = -1f
    private var cachedEffect: RenderEffect? = null

    override fun onAttach() {
        super.onAttach()
        attachToBackdrop()
    }

    override fun onDetach() {
        detachFromBackdrop()
        effectLayer?.let {
            requireGraphicsContext().releaseGraphicsLayer(it)
            effectLayer = null
        }
        super.onDetach()
    }

    internal fun attachToBackdrop() {
        backdrop.consumers.add(this)
    }

    internal fun detachFromBackdrop() {
        backdrop.consumers.remove(this)
    }

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        if (!coordinates.isAttached) return
        val origin = coordinates.positionInRoot()
        if (paneOriginInRoot != origin) {
            paneOriginInRoot = origin
            invalidateDraw()
        }
    }

    override fun ContentDrawScope.draw() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!backdrop.paused) {
                val sources = backdrop.orderedSources()
                if (sources.isNotEmpty() && size.width >= 1f && size.height >= 1f) {
                    val radiusPx = radius.toPx()
                    if (radiusPx > 0f) {
                        val scale = BACKDROP_SAMPLE_SCALE
                        val sigmaScaled = (radiusPx * scale).coerceIn(1f, 72f)
                        val padScaled = ceil(sigmaScaled).toInt().coerceAtLeast(1)
                        val scaledW = ceil(size.width * scale).toInt().coerceAtLeast(1)
                        val scaledH = ceil(size.height * scale).toInt().coerceAtLeast(1)
                        val layerW = scaledW + padScaled * 2
                        val layerH = scaledH + padScaled * 2

                        val target = effectLayer ?: requireGraphicsContext().createGraphicsLayer().also {
                            effectLayer = it
                        }
                        if (cachedSigma != sigmaScaled || cachedEffect == null) {
                            cachedSigma = sigmaScaled
                            cachedEffect = createBackdropRenderEffect(sigmaScaled)
                        }
                        target.compositingStrategy = CompositingStrategy.Offscreen
                        target.renderEffect = cachedEffect

                        target.record(IntSize(layerW, layerH)) {
                            translate(left = padScaled.toFloat(), top = padScaled.toFloat()) {
                                scale(scaleX = scale, scaleY = scale, pivot = Offset.Zero) {
                                    for (i in sources.indices) {
                                        val entry = sources[i]
                                        val sourceLayer = entry.layer ?: continue
                                        translate(
                                            left = entry.originInRoot.x - paneOriginInRoot.x,
                                            top = entry.originInRoot.y - paneOriginInRoot.y,
                                        ) {
                                            drawLayer(sourceLayer)
                                        }
                                    }
                                }
                            }
                        }

                        val invScale = 1f / scale
                        scale(scaleX = invScale, scaleY = invScale, pivot = Offset.Zero) {
                            translate(left = -padScaled.toFloat(), top = -padScaled.toFloat()) {
                                drawLayer(target)
                            }
                        }
                    }
                }
            } else {
                val cached = effectLayer
                if (cached != null && cachedSigma > 0f) {
                    val padScaled = ceil(cachedSigma).toInt().coerceAtLeast(1)
                    val invScale = 1f / BACKDROP_SAMPLE_SCALE
                    scale(scaleX = invScale, scaleY = invScale, pivot = Offset.Zero) {
                        translate(left = -padScaled.toFloat(), top = -padScaled.toFloat()) {
                            drawLayer(cached)
                        }
                    }
                }
            }
        }
        drawContent()
    }
}

private class BackdropBlurElement(
    private val backdrop: Backdrop,
    private val radius: Dp,
) : ModifierNodeElement<BackdropBlurNode>() {
    override fun create(): BackdropBlurNode = BackdropBlurNode(backdrop, radius)

    override fun update(node: BackdropBlurNode) {
        val backdropChanged = node.backdrop !== backdrop
        val radiusChanged = node.radius != radius
        if (backdropChanged) {
            node.detachFromBackdrop()
            node.backdrop = backdrop
            node.radius = radius
            node.attachToBackdrop()
        } else if (radiusChanged) {
            node.radius = radius
        }
        if (backdropChanged || radiusChanged) {
            node.invalidateDraw()
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is BackdropBlurElement) return false
        return backdrop === other.backdrop && radius == other.radius
    }

    override fun hashCode(): Int = 31 * backdrop.hashCode() + radius.hashCode()
}

/**
 * Samples all registered [backdrop] sources behind this pane into a downscaled, padded,
 * offscreen [GraphicsLayer] with hardware [RenderEffect] blur + vibrancy (API 31+).
 */
@Composable
fun BackdropBlur(
    backdrop: Backdrop,
    radius: Dp,
    modifier: Modifier = Modifier,
) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    Box(modifier.then(BackdropBlurElement(backdrop = backdrop, radius = radius)))
}

@RequiresApi(Build.VERSION_CODES.S)
private fun createBackdropRenderEffect(sigma: Float): RenderEffect {
    val blur = AndroidRenderEffect.createBlurEffect(
        sigma,
        sigma,
        Shader.TileMode.CLAMP,
    )
    val satMatrix = ColorMatrix().apply { setSaturation(BACKDROP_SATURATION_BOOST) }
    val vibrancy = AndroidRenderEffect.createColorFilterEffect(
        ColorMatrixColorFilter(satMatrix),
    )
    return AndroidRenderEffect.createChainEffect(vibrancy, blur).asComposeRenderEffect()
}
