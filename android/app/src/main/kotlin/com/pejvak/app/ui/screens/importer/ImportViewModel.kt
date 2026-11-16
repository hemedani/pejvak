package com.pejvak.app.ui.screens.importer

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pejvak.app.data.media.DeviceScanService
import com.pejvak.app.data.repository.LibraryRepository
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.domain.ScanCandidate
import com.pejvak.app.domain.ScanPlan
import com.pejvak.app.domain.ScanStatus
import com.pejvak.app.domain.libraryEntriesToVerify
import com.pejvak.app.domain.needsIdentification
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject

/**
 * Device import, in the order the user needs it: choose a source, watch it find
 * things, see exactly what it found, then decide. Nothing is written until the
 * final tap — the preview is an in-memory plan.
 */
@HiltViewModel
class ImportViewModel @Inject constructor(
    private val deviceScanService: DeviceScanService,
    private val libraryRepository: LibraryRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    enum class Phase { Choose, Scanning, Preview, Importing, Done }

    data class Progress(val done: Int = 0, val total: Int = 0)

    data class UiState(
        val phase: Phase = Phase.Choose,
        val busyLabel: String = "",
        val progress: Progress = Progress(),
        val plan: ScanPlan? = null,
        val identified: List<DeviceScanService.IdentifiedFile>? = null,
        val outcome: LibraryRepository.ImportOutcome? = null,
        val newOnly: Boolean = true,
        val error: String? = null,
    ) {
        val actionable: List<ScanCandidate>
            get() = plan?.candidates?.filter { needsIdentification(it.status) } ?: emptyList()
        val visible: List<ScanCandidate>
            get() = if (newOnly) actionable else (plan?.candidates ?: emptyList())
        val hasRelinks: Boolean
            get() = actionable.any { it.status == ScanStatus.Relink }
        val identifying: Boolean
            get() = phase == Phase.Preview && identified == null
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val cancelled = AtomicBoolean(false)
    private var scanJob: Job? = null
    private var grants: List<DeviceScanService.FolderGrant> = emptyList()

    fun hasAudioPermission(): Boolean = deviceScanService.hasAudioPermission()
    fun requiredAudioPermission(): String = deviceScanService.requiredAudioPermission()

    fun setNewOnly(value: Boolean) = _state.update { it.copy(newOnly = value) }
    fun dismissError() = _state.update { it.copy(error = null) }

    fun scanDevice() {
        cancelled.set(false)
        grants = emptyList()
        _state.update { it.copy(phase = Phase.Scanning, busyLabel = "Reading the media index…", progress = Progress(), error = null) }
        scanJob = viewModelScope.launch {
            try {
                val found = deviceScanService.enumerateDeviceAudio { count, total ->
                    _state.update { it.copy(progress = Progress(count, total)) }
                }
                buildPreview(found)
            } catch (error: Exception) {
                fail(error.message ?: "The scan could not be completed.")
            }
        }
    }

    fun onFolderPicked(treeUri: Uri) {
        val grant = deviceScanService.grantFromTreeUri(treeUri)
        if (grant == null) {
            _state.update { it.copy(phase = Phase.Choose) }
            return
        }
        cancelled.set(false)
        grants = listOf(grant)
        _state.update { it.copy(phase = Phase.Scanning, busyLabel = "Reading the folder…", progress = Progress(), error = null) }
        scanJob = viewModelScope.launch {
            try {
                val found = deviceScanService.enumerateFolder(grant) { count ->
                    _state.update { it.copy(progress = Progress(count, 0)) }
                }
                buildPreview(found)
            } catch (error: Exception) {
                fail(error.message ?: "The scan could not be completed.")
            }
        }
    }

    private suspend fun buildPreview(found: List<com.pejvak.app.domain.DiscoveredFile>) {
        if (cancelled.get()) return
        _state.update { it.copy(busyLabel = "Comparing against your library…") }
        val library = libraryRepository.loadLibraryIndex()
        // A moved file carries the same hash as the row it left behind, so ask the
        // filesystem which recorded locations have gone — but only the rows a found
        // file could match, not the whole library.
        val gone = libraryRepository.findGoneLocations(libraryEntriesToVerify(found, library))
        val plan = com.pejvak.app.domain.buildScanPlan(found, library, gone)
        _state.update { it.copy(plan = plan, identified = null, phase = Phase.Preview) }
        identify(plan.candidates)
    }

    private suspend fun identify(candidates: List<ScanCandidate>) {
        val needsWork = candidates.filter { needsIdentification(it.status) }
        if (needsWork.isEmpty()) {
            _state.update { it.copy(identified = emptyList()) }
            return
        }
        _state.update { it.copy(busyLabel = "Identifying files…") }
        val result = deviceScanService.identifyFiles(
            needsWork.map { it.file },
            onProgress = { done, total -> _state.update { it.copy(progress = Progress(done, total)) } },
            isCancelled = { cancelled.get() },
        )
        if (!cancelled.get()) {
            _state.update { it.copy(identified = result.identified) }
        }
    }

    fun commit() {
        val identified = _state.value.identified ?: return
        _state.update { it.copy(phase = Phase.Importing, progress = Progress(0, identified.size)) }
        viewModelScope.launch {
            val outcome = libraryRepository.importIdentifiedFiles(
                identified,
                grants = grants,
                onProgress = { done, total -> _state.update { it.copy(progress = Progress(done, total)) } },
            )
            _state.update { it.copy(outcome = outcome, phase = Phase.Done) }
            // New tracks are the first thing the server needs; push them now rather
            // than waiting for the periodic baseline.
            if (outcome.imported.isNotEmpty() || outcome.relinked > 0) syncScheduler.syncNow()
        }
    }

    fun cancel() {
        cancelled.set(true)
        scanJob?.cancel()
        _state.update { it.copy(phase = Phase.Choose, plan = null, identified = null, error = null) }
    }

    private fun fail(message: String) {
        if (!cancelled.get()) {
            _state.update { it.copy(phase = Phase.Choose, error = message) }
        }
    }
}