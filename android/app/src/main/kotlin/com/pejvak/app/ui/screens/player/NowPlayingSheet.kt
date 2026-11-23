package com.pejvak.app.ui.screens.player

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.DEFAULT_TONE_ID
import com.pejvak.app.domain.TONES
import com.pejvak.app.domain.describeNoteTags
import com.pejvak.app.domain.findTone
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.pickAnnotationColor
import com.pejvak.app.playback.PlaybackContext
import com.pejvak.app.ui.components.CollectionSortSheet
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.LocalSheetPresence
import com.pejvak.app.ui.components.MiniPlayerRow
import com.pejvak.app.ui.components.PaletteTile
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.dockElevation
import com.pejvak.app.ui.components.notes.AnnotationComposerSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.PejvakSpring
import com.pejvak.app.ui.theme.tileRadius
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@Composable
fun NowPlayingSheet(
    vm: PlayerViewModel,
    visible: Boolean,
    onDismiss: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenContext: (PlaybackContext) -> Unit,
    targetRect: Rect? = null,
    isStandaloneMini: Boolean = false,
    onExpandProgress: (Float) -> Unit = {},
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val onExpandUpdated by rememberUpdatedState(onExpandProgress)

    val expand = remember { Animatable(if (visible) 1f else 0f) }
    var interactiveExpand by remember { mutableStateOf<Float?>(null) }
    var animating by remember { mutableStateOf(false) }
    var isDismissing by remember { mutableStateOf(false) }
    var pullSettled by remember { mutableStateOf(false) }
    var settleJob by remember { mutableStateOf<Job?>(null) }

    val openSpring: SpringSpec<Float> = remember {
        spring(dampingRatio = 0.88f, stiffness = 310f)
    }
    val closeSpring: SpringSpec<Float> = remember {
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = 380f)
    }

    val mounted = visible || animating

    // Drive morph expansion on open/close visibility transitions, and preserve smooth
    // mid-flight reversals if the listener re-taps the mini-player while closing.
    LaunchedEffect(visible, motion) {
        if (visible) {
            settleJob?.cancel()
            settleJob = null
            interactiveExpand = null
            isDismissing = false
            pullSettled = false
            animating = true
            try {
                if (motion) {
                    if (expand.value <= 0.005f) expand.snapTo(0f)
                    expand.animateTo(1f, openSpring)
                } else {
                    expand.snapTo(1f)
                }
            } finally {
                animating = false
            }
        } else if (!isDismissing && (expand.value > 0f || interactiveExpand != null)) {
            settleJob?.cancel()
            settleJob = null
            animating = true
            isDismissing = true
            try {
                interactiveExpand?.let {
                    expand.snapTo(it)
                    interactiveExpand = null
                }
                if (motion) {
                    expand.animateTo(0f, closeSpring)
                } else {
                    expand.snapTo(0f)
                }
            } finally {
                animating = false
                isDismissing = false
            }
        }
    }

    // Stream live normalized expand progress to PejvakNavHost so the shell backdrop
    // blur lifts smoothly as the player shrinks back onto the dock.
    LaunchedEffect(mounted) {
        if (!mounted) {
            onExpandUpdated(0f)
            return@LaunchedEffect
        }
        snapshotFlow { (interactiveExpand ?: expand.value).coerceIn(0f, 1f) }
            .collect { progress -> onExpandUpdated(progress) }
    }
    DisposableEffect(Unit) {
        onDispose { onExpandUpdated(0f) }
    }

    fun requestDismiss(initialVelocity: Float = 0f) {
        if (isDismissing) return
        settleJob?.cancel()
        animating = true
        isDismissing = true
        settleJob = scope.launch {
            try {
                interactiveExpand?.let {
                    expand.snapTo(it)
                    interactiveExpand = null
                }
                if (motion) {
                    expand.animateTo(0f, closeSpring, initialVelocity = initialVelocity)
                } else {
                    expand.snapTo(0f)
                }
                onDismiss()
            } finally {
                animating = false
                isDismissing = false
            }
        }
    }

    BackHandler(enabled = visible && !isDismissing) {
        requestDismiss()
    }

    if (!mounted) return

    val state by vm.frame.collectAsStateWithLifecycle()
    val mini by vm.mini.collectAsStateWithLifecycle()
    val notes by vm.notes.collectAsStateWithLifecycle()
    val queue by vm.queue.collectAsStateWithLifecycle()
    val enhancer by vm.enhancer.collectAsStateWithLifecycle()
    val toneId by vm.toneId.collectAsStateWithLifecycle()
    val toneLevel by vm.toneLevel.collectAsStateWithLifecycle()
    val volume by vm.volume.collectAsStateWithLifecycle()
    val enhancerStatus by vm.enhancerStatus.collectAsStateWithLifecycle()

    var showQueue by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    var showJump by remember { mutableStateOf(false) }
    var showEnhancer by remember { mutableStateOf(false) }
    var showTone by remember { mutableStateOf(false) }
    var composerOpen by remember { mutableStateOf(false) }
    var composerPosition by remember { mutableIntStateOf(0) }
    var selectedNote by remember { mutableStateOf<Annotation?>(null) }
    var editingNote by remember { mutableStateOf<Annotation?>(null) }
    var confirmDeleteNote by remember { mutableStateOf<Annotation?>(null) }

    // A sheet opened from the player renders in its own window, so the shell's
    // frost only reaches the library behind the player. Blur the player's own
    // content while one of its sheets is up so the sheet reads as real glass over
    // the player, not a panel over a still-sharp screen; the smoker frost below is
    // the API 29–30 fallback because Modifier.blur is a no-op there.
    val presence = LocalSheetPresence.current
    val sheetCount = presence?.count ?: 0
    val frost by animateDpAsState(
        targetValue = if (sheetCount > 0) 16.dp else 0.dp,
        animationSpec = tween(220),
        label = "playerFrost",
    )

    val navBottomDp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    // Coordinate anchors for the shared artwork hand-off between HeroArtwork and MiniPlayerRow.
    var fullBoxCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var insetBoxCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var playerRootCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var heroTileCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var insetOrigin by remember { mutableStateOf(Offset.Zero) }
    var heroTileInPlayer by remember { mutableStateOf<Rect?>(null) }

    fun recomputeHeroRect() {
        val fBox = fullBoxCoords
        val iBox = insetBoxCoords
        if (fBox != null && fBox.isAttached && iBox != null && iBox.isAttached) {
            insetOrigin = fBox.localPositionOf(iBox, Offset.Zero)
        }
        val pRoot = playerRootCoords
        val hTile = heroTileCoords
        heroTileInPlayer = if (pRoot != null && pRoot.isAttached && hTile != null && hTile.isAttached) {
            val pos = pRoot.localPositionOf(hTile, Offset.Zero)
            val sz = Size(hTile.size.width.toFloat(), hTile.size.height.toFloat())
            val absTop = insetOrigin.y + pos.y
            if (sz.width > 0f && sz.height > 0f && absTop + sz.height > insetOrigin.y) {
                Rect(insetOrigin + pos, sz)
            } else {
                null
            }
        } else {
            null
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val maxW = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val maxH = constraints.maxHeight.toFloat().coerceAtLeast(1f)
        val maxWDp = with(density) { maxW.toDp() }
        val maxHDp = with(density) { maxH.toDp() }

        val marginPx = with(density) { geo.dock.margin.toPx() }
        val navBottomPx = with(density) { navBottomDp.toPx() }
        val rowHeightPx = with(density) { geo.dock.playerHeight.toPx() }
        val fallbackBottom = (maxH - navBottomPx - marginPx).coerceAtLeast(rowHeightPx + marginPx)
        val miniRect = targetRect ?: Rect(
            left = marginPx,
            top = (fallbackBottom - rowHeightPx).coerceAtLeast(0f),
            right = (maxW - marginPx).coerceAtLeast(marginPx + 1f),
            bottom = fallbackBottom,
        )

        val pullTravelPx = miniRect.top.coerceAtLeast(with(density) { 420.dp.toPx() })
        val dismissDistPx = with(density) { 105.dp.toPx() }
        val dismissDistFraction = (dismissDistPx / pullTravelPx).coerceIn(0.08f, 0.45f)
        val flingVelocityThreshold = with(density) { 520.dp.toPx() }

        fun finishPull(velocityY: Float) {
            if (pullSettled) return
            val from = interactiveExpand ?: return
            pullSettled = true
            settleJob?.cancel()
            if (from >= 0.999f && velocityY <= flingVelocityThreshold) {
                interactiveExpand = null
                settleJob = scope.launch { expand.snapTo(1f) }
                return
            }
            val shouldDismiss = from < (1f - dismissDistFraction) ||
                    (velocityY > flingVelocityThreshold && from < 0.985f)
            if (shouldDismiss) {
                val initialV = -(velocityY / pullTravelPx).coerceAtLeast(0f)
                requestDismiss(initialVelocity = initialV)
            } else {
                settleJob = scope.launch {
                    expand.snapTo(from)
                    interactiveExpand = null
                    if (motion) {
                        expand.animateTo(1f, PejvakSpring.sheet)
                    } else {
                        expand.snapTo(1f)
                    }
                }
            }
        }

        val t = (interactiveExpand ?: expand.value).coerceIn(0f, 1f)

        val cardLeft = lerpF(miniRect.left, 0f, t)
        val cardTop = lerpF(miniRect.top, 0f, t)
        val cardRight = lerpF(miniRect.right, maxW, t)
        val cardBottom = lerpF(miniRect.bottom, maxH, t)
        val cardW = (cardRight - cardLeft).coerceAtLeast(1f)
        val cardH = (cardBottom - cardTop).coerceAtLeast(1f)
        val cardWDp = with(density) { cardW.toDp() }
        val cardHDp = with(density) { cardH.toDp() }

        val miniHDp = with(density) { miniRect.height.toDp() }
        val miniCornerDp = if (isStandaloneMini) (miniHDp / 2f) else geo.radius.xl
        val cornerFactor = 1f - t.pow(1.6f)
        val cardShape = RoundedCornerShape(miniCornerDp * cornerFactor)
        val rimAlpha = ((1f - t) / 0.22f).coerceIn(0f, 1f)
        val cardShadowDp = dockElevation() * ((1f - t) * 1.15f).coerceIn(0f, 1f)

        val contentAlpha = ((t - 0.34f) / 0.56f).coerceIn(0f, 1f)
        val contentScale = lerpF(0.84f, 1f, t)
        val miniRowAlpha = ((0.52f - t) / 0.40f).coerceIn(0f, 1f)
        val miniRowScale = lerpF(1f, 0.94f, (t / 0.52f).coerceIn(0f, 1f))

        val heroRect = heroTileInPlayer
        val canFlyArt = mini != null && heroRect != null && t > 0.005f && t < 0.995f
        val tileFadeAlpha = if (canFlyArt) 0f else 1f

        val cardElevationModifier = if (cardShadowDp > 0.5.dp) {
            Modifier.shadow(
                elevation = cardShadowDp,
                shape = cardShape,
                clip = false,
                ambientColor = Color.Black.copy(alpha = 0.22f),
                spotColor = Color.Black.copy(alpha = 0.28f),
            )
        } else {
            Modifier
        }

        val blockerInteraction = remember { MutableInteractionSource() }

        // Morphing player surface: full screen at `t = 1f`, crystalline mini-player capsule at `t = 0f`.
        Box(
            modifier = Modifier
                .offset { IntOffset(cardLeft.roundToInt(), cardTop.roundToInt()) }
                .size(cardWDp, cardHDp)
                .then(cardElevationModifier)
                .clip(cardShape)
                .background(tokens.canvasBase.copy(alpha = 0.68f * t))
                .background(tokens.glassFill.copy(alpha = tokens.glassFill.alpha * t))
                .background(tokens.frostBase.copy(alpha = tokens.frostBase.alpha * (1f - t)))
                .background(tokens.frostScrim.copy(alpha = tokens.frostScrim.alpha * (1f - t)))
                .background(tokens.frostSheen.copy(alpha = tokens.frostSheen.alpha * (1f - t)))
                // The player is a full-screen surface while open, so an unclaimed tap stops here
                // rather than leaking through to the library underneath. Released as dismiss settles.
                .clickable(
                    interactionSource = blockerInteraction,
                    indication = null,
                    enabled = !isDismissing && t > 0.1f,
                    onClick = {},
                ),
        ) {
            // Fixed full-viewport layout for PlayerContent so controls never reflow or squish while shrinking.
            Box(
                modifier = Modifier
                    .wrapContentSize(align = Alignment.TopCenter, unbounded = true)
                    .size(maxWDp, maxHDp)
                    .then(if (frost > 0.5.dp) Modifier.blur(frost) else Modifier)
                    .onGloballyPositioned { coords ->
                        fullBoxCoords = coords
                        recomputeHeroRect()
                    },
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .systemBarsPadding()
                        .onGloballyPositioned { coords ->
                            insetBoxCoords = coords
                            recomputeHeroRect()
                        },
                ) {
                    PlayerContent(
                        state = state,
                        positionFlow = vm.position,
                        listened = vm.listened,
                        waveform = vm.waveform,
                        notes = notes,
                        enhancer = enhancer,
                        volume = volume,
                        sleepRemaining = vm.sleepRemainingSec,
                        toneLevel = toneLevel,
                        toneLabel = roomToneLabel(toneId),
                        onClose = { requestDismiss() },
                        onToggle = vm::toggle,
                        onNext = vm::next,
                        onPrevious = vm::previous,
                        onRewind = { vm.skipBy(-30) },
                        onForward = { vm.skipBy(30) },
                        onSeek = vm::seekTo,
                        onMarker = { note ->
                            vm.seekTo(note.positionSec)
                            selectedNote = note
                        },
                        onAddNote = {
                            editingNote = null
                            composerPosition = vm.position.value
                            selectedNote = null
                            composerOpen = true
                        },
                        onCycleSpeed = vm::cycleSpeed,
                        onVolume = vm::setVolume,
                        onToneLevel = vm::setToneLevel,
                        onOpenTone = { showTone = true },
                        onOpenQueue = { showQueue = true },
                        onOpenSleep = { showSleep = true },
                        onOpenJump = { showJump = true },
                        onOpenEnhancer = { showEnhancer = true },
                        onOpenAi = {
                            // The AI catalogue is a sheet that opens *over* the player
                            // (it frosts behind via LocalSheetPresence); it must not
                            // dismiss the full player first — that is what threw the
                            // listener back to the mini-player.
                            onOpenAi()
                        },
                        onOpenSort = { showSort = true },
                        onOpenContext = {
                            // The chip carries the collection this run belongs to, so it has
                            // to open that collection — not the Library tab it used to fall
                            // back to, which read as "the folder button goes home".
                            val context = state.context
                            onDismiss()
                            if (context != null) onOpenContext(context)
                        },
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                alpha = contentAlpha
                                scaleX = contentScale
                                scaleY = contentScale
                                transformOrigin = TransformOrigin(0.5f, 0.14f)
                            },
                        onPullDown = { dy ->
                            settleJob?.cancel()
                            settleJob = null
                            isDismissing = false
                            pullSettled = false
                            val current = interactiveExpand ?: expand.value
                            interactiveExpand = (current - dy / pullTravelPx).coerceIn(0f, 1f)
                        },
                        onPullEnd = { velocityY -> finishPull(velocityY) },
                        isPulled = { (interactiveExpand ?: expand.value) < 0.999f },
                        heroTileAlpha = tileFadeAlpha,
                        onPlayerRootPositioned = { coords ->
                            playerRootCoords = coords
                            recomputeHeroRect()
                        },
                        onHeroTilePositioned = { coords ->
                            heroTileCoords = coords
                            recomputeHeroRect()
                        },
                    )
                }
            }

            // Docked MiniPlayerRow cross-fades cleanly inside the shrinking glass capsule.
            val currentMini = mini
            if (currentMini != null && miniRowAlpha > 0f) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            alpha = miniRowAlpha
                            scaleX = miniRowScale
                            scaleY = miniRowScale
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    MiniPlayerRow(
                        nowPlaying = currentMini,
                        miniProgress = vm.miniProgress,
                        miniWaveform = vm.waveform,
                        onPlayPause = vm::toggle,
                        onNext = vm::next,
                        onExpand = {},
                        onClose = { requestDismiss() },
                        tileAlpha = tileFadeAlpha,
                        modifier = Modifier.height(geo.dock.playerHeight),
                    )
                }
            }

            // Catchlight bevel border emerges smoothly as the sheet detaches into a floating card.
            if (rimAlpha > 0f) {
                Box(
                    Modifier
                        .matchParentSize()
                        .border(
                            width = 1.dp,
                            brush = Brush.verticalGradient(
                                0f to tokens.glassHighlight.copy(alpha = tokens.glassHighlight.alpha * rimAlpha),
                                0.32f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.58f * rimAlpha),
                                0.75f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.24f * rimAlpha),
                                1f to tokens.glassBorder.copy(alpha = tokens.glassBorder.alpha * 0.62f * rimAlpha),
                            ),
                            shape = cardShape,
                        ),
                )
            }

            if (frost > 0.5.dp) {
                Box(
                    Modifier
                        .matchParentSize()
                        .background(tokens.frostFallback.copy(alpha = 0.30f * (frost.value / 16f))),
                )
            }
        }

        // Shared floating artwork bridging HeroArtwork <-> MiniPlayerRow's PaletteTile.
        if (canFlyArt) {
            val mdTilePx = with(density) { geo.tiles.md.toPx() }
            val dockInsetPx = with(density) { geo.dock.inset.toPx() }
            val miniArtLeft = miniRect.left + dockInsetPx
            val miniArtTop = miniRect.top + (miniRect.height - mdTilePx) / 2f

            val artLeft = lerpF(miniArtLeft, heroRect.left, t)
            val artTop = lerpF(miniArtTop, heroRect.top, t)
            val artSizePx = lerpF(mdTilePx, heroRect.width, t).coerceAtLeast(1f)
            val artSizeDp = with(density) { artSizePx.toDp() }
            val artRadiusDp = lerpDp(tileRadius(geo.tiles.md), geo.radius.lg - 4.dp, t)

            PaletteTile(
                contentHash = state.contentHash,
                label = state.title,
                artworkUrl = state.artworkUrl,
                size = artSizeDp,
                radius = artRadiusDp,
                modifier = Modifier.offset { IntOffset(artLeft.roundToInt(), artTop.roundToInt()) },
            )
        }
    }

    if (showSort) {
        val sortOptions by vm.sortOptions.collectAsStateWithLifecycle()
        val context = state.context
        if (context != null) {
            CollectionSortSheet(
                options = sortOptions,
                sort = context.sort,
                direction = context.direction,
                onDismiss = { showSort = false },
                onSelect = vm::setCollectionSort,
            )
        }
    }
    if (showQueue) {
        QueueSheet(
            tracks = queue,
            currentIndex = state.queueIndex,
            onSelect = { index ->
                vm.jumpToQueueIndex(index)
                showQueue = false
            },
            onDismiss = { showQueue = false },
        )
    }
    if (showSleep) {
        val sleepRemainingSec by vm.sleepRemainingSec.collectAsStateWithLifecycle()
        SleepTimerSheet(
            active = sleepRemainingSec != null,
            remainingSec = sleepRemainingSec,
            onStart = vm::setSleep,
            onCancel = vm::cancelSleep,
            onDismiss = { showSleep = false },
        )
    }
    if (showJump) {
        JumpToTimeSheet(
            position = vm.position,
            durationSec = state.durationSec,
            onSeek = vm::seekTo,
            onDismiss = { showJump = false },
        )
    }
    if (showEnhancer) {
        AudioEnhancerSheet(
            settings = enhancer,
            available = enhancerStatus.available,
            unavailableReason = enhancerStatus.reason,
            toneLabel = findTone(toneId)?.label ?: TONES.first().label,
            onUpdate = { enabled, boostDb, bassDb, trebleDb ->
                vm.updateEnhancer(enabled, boostDb, bassDb, trebleDb)
            },
            onOpenTones = {
                showEnhancer = false
                showTone = true
            },
            onDismiss = { showEnhancer = false },
        )
    }
    LaunchedEffect(showEnhancer) {
        if (showEnhancer) vm.probeEnhancer()
    }
    if (showTone) {
        TonePickerSheet(
            toneId = toneId,
            level = toneLevel,
            onSelect = vm::selectTone,
            onLevel = vm::setToneLevel,
            onDismiss = { showTone = false },
        )
    }
    selectedNote?.let { note ->
        PlayerNoteSheet(
            note = note,
            onClose = { selectedNote = null },
            onEdit = {
                editingNote = note
                composerPosition = note.positionSec
                selectedNote = null
                composerOpen = true
            },
            onDelete = { confirmDeleteNote = note },
        )
    }

    if (composerOpen) {
        val target = editingNote
        AnnotationComposerSheet(
            positionSec = target?.positionSec ?: composerPosition,
            annotation = target,
            initialColor = target?.color ?: pickAnnotationColor(notes.size),
            onCancel = {
                composerOpen = false
                editingNote = null
            },
            onSave = { text, tags, color ->
                val saved = vm.saveNote(target, target?.positionSec ?: composerPosition, text, tags, color)
                if (saved) {
                    composerOpen = false
                    editingNote = null
                }
                saved
            },
        )
    }

    confirmDeleteNote?.let { note ->
        AlertDialog(
            onDismissRequest = { confirmDeleteNote = null },
            containerColor = tokens.canvasBase,
            titleContentColor = tokens.text,
            textContentColor = tokens.textSecondary,
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                ) {
                    PejvakIcon("warning", null, tint = tokens.danger, size = geo.icons.md)
                    Text(stringResource(R.string.note_selected_delete_title))
                }
            },
            text = { Text(stringResource(R.string.note_selected_delete_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDeleteNote = null
                        selectedNote = null
                        scope.launch { vm.deleteNote(note) }
                    },
                ) {
                    Text(stringResource(R.string.note_selected_delete), color = tokens.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteNote = null }) {
                    Text(stringResource(R.string.note_selected_cancel), color = tokens.text)
                }
            },
        )
    }
}

/** "Room tone" for the default room noise, otherwise the selected tone's own name. */
@Composable
private fun roomToneLabel(toneId: String): String {
    val tone = findTone(toneId)
    return if (tone == null || tone.id == DEFAULT_TONE_ID) {
        stringResource(R.string.player_room_tone)
    } else {
        tone.label
    }
}

/** The selected-note sheet in the player: the note in full, with edit and delete. */
@Composable
private fun PlayerNoteSheet(
    note: Annotation,
    onClose: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(
        onDismiss = onClose,
        title = stringResource(R.string.player_note),
        subtitle = formatClock(note.positionSec),
        icon = "note",
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            Text(
                text = note.text,
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.text,
            )
            describeNoteTags(note.tags)?.let { tags ->
                Text(
                    text = tags,
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.textTertiary,
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                GlassChip(
                    label = stringResource(R.string.note_selected_edit),
                    icon = "edit",
                    onClick = onEdit,
                )
                GlassChip(
                    label = stringResource(R.string.note_selected_delete),
                    icon = "trash",
                    onClick = onDelete,
                    modifier = Modifier.border(
                        1.dp,
                        tokens.danger,
                        RoundedCornerShape(geo.radius.pill),
                    ),
                )
            }
        }
    }
}

private fun lerpF(start: Float, stop: Float, t: Float): Float = start + (stop - start) * t

private fun lerpDp(start: Dp, stop: Dp, t: Float): Dp = start + (stop - start) * t
