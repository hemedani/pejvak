package com.pejvak.app.ui.screens.notes

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.AnnotationRepository
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.domain.ANY_DATE
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.DateRange
import com.pejvak.app.domain.NoteHit
import com.pejvak.app.domain.NoteWithTrack
import com.pejvak.app.domain.annotationsToMarkdown
import com.pejvak.app.domain.notesInRange
import com.pejvak.app.domain.searchNotes
import com.pejvak.app.playback.CollectionPlaybackLauncher
import com.pejvak.app.playback.PlaybackService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class NotesUiState(
    val rows: List<NoteHit> = emptyList(),
    val datedTotal: Int = 0,
    val total: Int = 0,
    val query: String = "",
    val range: DateRange = ANY_DATE,
    val loading: Boolean = true,
)

/**
 * The Notes screen's state. Notes are observed live, so a note written in the
 * player (a modal over this tab) appears without a manual refresh. Search and the
 * date range are composed in that order: the date filter first, then the search
 * reads what it leaves — "no match" while a range is on means inside the range.
 */
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val annotations: AnnotationRepository,
    private val library: LibraryRepository,
    private val launcher: CollectionPlaybackLauncher,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val all = MutableStateFlow<List<NoteWithTrack>>(emptyList())
    private val loading = MutableStateFlow(true)
    private val query = MutableStateFlow("")
    private val range = MutableStateFlow(ANY_DATE)

    val state: StateFlow<NotesUiState> = combine(all, query, range, loading) { notes, q, r, l ->
        val dated = notesInRange(notes, r)
        NotesUiState(
            rows = searchNotes(dated, q),
            datedTotal = dated.size,
            total = notes.size,
            query = q,
            range = r,
            loading = l,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NotesUiState())

    private val _selected = MutableStateFlow<NoteWithTrack?>(null)
    val selected: StateFlow<NoteWithTrack?> = _selected.asStateFlow()

    private val _trackNotes = MutableStateFlow<List<Annotation>>(emptyList())
    val trackNotes: StateFlow<List<Annotation>> = _trackNotes.asStateFlow()

    init {
        viewModelScope.launch {
            annotations.observeLive().collect { rows ->
                val tracks = library
                    .getTracks(rows.map { it.trackId }.distinct())
                    .associateBy { it.id }
                all.value = rows.mapNotNull { annotation ->
                    tracks[annotation.trackId]?.let { NoteWithTrack(annotation, it) }
                }
                loading.value = false
            }
        }
    }

    fun setQuery(value: String) {
        query.value = value
    }

    fun setRange(value: DateRange) {
        range.value = value
    }

    fun open(note: NoteWithTrack) {
        _selected.value = note
        viewModelScope.launch { _trackNotes.value = annotations.getForTrack(note.track.id) }
    }

    fun closeDetail() {
        _selected.value = null
        _trackNotes.value = emptyList()
    }

    suspend fun saveEdit(note: NoteWithTrack, text: String, tags: List<String>, color: String): Boolean =
        try {
            annotations.update(note.annotation.id, text, tags, color) != null
        } catch (_: Exception) {
            false
        }

    fun delete(note: NoteWithTrack) {
        viewModelScope.launch {
            annotations.delete(note.annotation.id)
            if (_selected.value?.annotation?.id == note.annotation.id) closeDetail()
        }
    }

    fun resume(note: NoteWithTrack) {
        viewModelScope.launch {
            PlaybackService.start(context)
            launcher.playResolved(
                note.track,
                note.annotation.positionSec,
                fallbackQueue = listOf(note.track.id),
                fallbackIndex = 0,
            )
        }
    }

    /** The Markdown document for the note's track, for the native share sheet. */
    fun markdown(note: NoteWithTrack): String {
        val notes = _trackNotes.value.ifEmpty { listOf(note.annotation) }
        return annotationsToMarkdown(note.track, notes)
    }
}
