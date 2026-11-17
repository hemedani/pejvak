package com.pejvak.app.ui.screens.player

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.TONES
import com.pejvak.app.domain.describeNoteTags
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.pickAnnotationColor
import com.pejvak.app.domain.findTone
import com.pejvak.app.playback.PlaybackContext
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.notes.AnnotationComposerSheet
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
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

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(tokens.canvasBase.copy(alpha = 0.68f))
                .background(tokens.glassFill)
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) awaitPointerEvent()
                    }
                }
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
            )
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
