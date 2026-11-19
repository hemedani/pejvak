package com.pejvak.app.ui.screens.player

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.DEFAULT_TONE_ID
import com.pejvak.app.domain.TONES
import com.pejvak.app.domain.describeNoteTags
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.pickAnnotationColor
import com.pejvak.app.domain.findTone
import com.pejvak.app.playback.PlaybackContext
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.LocalSheetPresence
import com.pejvak.app.ui.components.notes.AnnotationComposerSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import com.pejvak.app.ui.theme.useMotionEnabled

@Composable
fun NowPlayingSheet(
    vm: PlayerViewModel,
    visible: Boolean,
    onDismiss: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenContext: (PlaybackContext) -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val scope = rememberCoroutineScope()
    BackHandler(enabled = visible, onBack = onDismiss)
    AnimatedVisibility(
        visible = visible,
        enter = if (motion) {
            fadeIn(tween(220)) +
                scaleIn(tween(280), initialScale = 0.9f, transformOrigin = TransformOrigin(0.5f, 0.92f)) +
                slideInVertically(tween(280)) { it / 18 }
        } else {
            EnterTransition.None
        },
        exit = if (motion) {
            fadeOut(tween(160)) +
                scaleOut(tween(200), targetScale = 0.96f, transformOrigin = TransformOrigin(0.5f, 0.92f)) +
                slideOutVertically(tween(200)) { it / 24 }
        } else {
            ExitTransition.None
        },
    ) {
        val state by vm.frame.collectAsStateWithLifecycle()
        val notes by vm.notes.collectAsStateWithLifecycle()
        val queue by vm.queue.collectAsStateWithLifecycle()
        val enhancer by vm.enhancer.collectAsStateWithLifecycle()
        val toneId by vm.toneId.collectAsStateWithLifecycle()
        val toneLevel by vm.toneLevel.collectAsStateWithLifecycle()
        val volume by vm.volume.collectAsStateWithLifecycle()
        val enhancerStatus by vm.enhancerStatus.collectAsStateWithLifecycle()

        var showQueue by remember { mutableStateOf(false) }
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
        // frost only reaches the library behind the player. Darken the player's own
        // surface with the smoked frost while one of its sheets is up — `Modifier.blur`
        // here would blur the player's whole tree and is not worth the render cost.
        val presence = LocalSheetPresence.current
        val sheetCount = presence?.count ?: 0
        val frost by animateDpAsState(
            targetValue = if (sheetCount > 0) 16.dp else 0.dp,
            animationSpec = tween(220),
            label = "playerFrost",
        )

        // Swipe the player down to sink back to the mini player. This is the only
        // pointer handler on the surface: two handlers on one node meant the inner one
        // got every event and the drag never started, and being *hit* here is also what
        // keeps a tap from reaching the library behind the player.
        val density = LocalDensity.current
        val dismissAt = with(density) { 110.dp.toPx() }
        val travel = with(density) { 320.dp.toPx() }
        val exitTravel = with(density) { 460.dp.toPx() }
        var dragY by remember { mutableFloatStateOf(0f) }
        var pullReleased by remember { mutableStateOf(false) }
        var settleJob by remember { mutableStateOf<Job?>(null) }
        val sank = (dragY / travel).coerceIn(0f, 1f)

        // A pull ends exactly once, and either way it has to end in a position the
        // player can rest in: all the way up, or all the way down. The end is
        // reported twice — by the body's pointer release and by the fling callback —
        // because the fling never fires for a slow lift with no velocity, which is
        // how the player used to be left stranded half-way.
        fun finishPull() {
            if (pullReleased) return
            pullReleased = true
            val from = dragY
            if (from <= 0f) return
            settleJob?.cancel()
            settleJob = scope.launch {
                if (from > dismissAt) {
                    // Carry it out of the way before the surface fades, so a dismissed
                    // player leaves downwards instead of dissolving in place.
                    Animatable(from).animateTo(exitTravel, tween(170)) { dragY = value }
                    onDismiss()
                } else {
                    Animatable(from).animateTo(0f, tween(200)) { dragY = value }
                }
            }
        }

        // The sheet stays composed while it animates out, so the next open must start
        // from rest rather than from wherever the last dismissal left it.
        LaunchedEffect(visible) {
            if (visible) {
                settleJob?.cancel()
                dragY = 0f
                pullReleased = false
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .offset { IntOffset(0, dragY.roundToInt()) }
                .background(tokens.canvasBase.copy(alpha = 0.68f * (1f - 0.7f * sank)))
                // Scale the token's own alpha rather than replacing it: glassFill is a
                // near-transparent white, and copy(alpha = 1f) painted the player solid.
                .background(tokens.glassFill.copy(alpha = tokens.glassFill.alpha * (1f - 0.85f * sank)))
                // The player is a full-screen surface, so a tap that no control claimed
                // must stop here rather than reach the library behind it. A no-ripple
                // clickable does that without stealing the drags the body scroll needs.
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                )
                .systemBarsPadding(),
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
                onClose = onDismiss,
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
                    onDismiss()
                    onOpenAi()
                },
                onOpenContext = {
                    // The chip carries the collection this run belongs to, so it has
                    // to open that collection — not the Library tab it used to fall
                    // back to, which read as "the folder button goes home".
                    val context = state.context
                    onDismiss()
                    if (context != null) onOpenContext(context)
                },
                modifier = Modifier.fillMaxSize(),
                onPullDown = { dy ->
                    settleJob?.cancel()
                    settleJob = null
                    pullReleased = false
                    dragY = (dragY + dy * 0.7f).coerceIn(0f, travel * 1.2f)
                },
                onPullEnd = { finishPull() },
            )
            if (frost > 0.5.dp) {
                Box(
                    Modifier
                        .matchParentSize()
                        .background(tokens.frostFallback.copy(alpha = 0.30f * (frost.value / 16f))),
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
                title = { Text(stringResource(R.string.note_selected_delete_title)) },
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
    GlassSheet(onDismiss = onClose) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.md),
        ) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    text = formatClock(note.positionSec),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.text,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onEdit) {
                    Text(stringResource(R.string.note_selected_edit), color = tokens.accent)
                }
                TextButton(onClick = onDelete) {
                    Text(stringResource(R.string.note_selected_delete), color = tokens.danger)
                }
            }
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
        }
    }
}
