package com.pejvak.app.domain

/**
 * The newest resumable run per collection, newest first.
 *
 * `context_plays` keeps one row per play, so the same collection legitimately has
 * many rows. A "continue listening" list needs exactly one entry per collection:
 * a second entry is not only noise, it is a **duplicate Lazy key** — the cards are
 * keyed by context key, and two equal keys throw
 * `IllegalArgumentException: Key "…" was already used`, which closes the app.
 *
 * Completed runs are done (nothing to resume) and soft-deleted ones are gone.
 */
fun resumableRuns(runs: List<ContextPlay>, limit: Int = 8): List<ContextPlay> =
    runs.asSequence()
        .filter { it.contextType == ContextType.Online && !it.completed && it.deletedAt == null }
        .sortedByDescending { it.updatedAt }
        .distinctBy { it.contextKey }
        .take(limit)
        .toList()
