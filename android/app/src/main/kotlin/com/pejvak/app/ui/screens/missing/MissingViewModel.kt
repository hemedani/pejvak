package com.pejvak.app.ui.screens.missing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.domain.MissingGroup
import com.pejvak.app.domain.MissingTrack
import com.pejvak.app.domain.groupByFolder
import com.pejvak.app.domain.summariseMissing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The files that moved out from under the library. Grouped by source folder so the
 * screen says which folder to point the scan at. Re-reads on resume because a
 * relink happens on the import screen.
 */
@HiltViewModel
class MissingViewModel @Inject constructor(
    private val libraryRepository: LibraryRepository,
) : ViewModel() {

    data class UiState(
        val loading: Boolean = true,
        val missing: List<MissingTrack> = emptyList(),
    ) {
        val groups: List<MissingGroup> get() = groupByFolder(missing)
        val summary: String get() = summariseMissing(missing)
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val missing = libraryRepository.listMissing()
            _state.update { it.copy(loading = false, missing = missing) }
        }
    }
}