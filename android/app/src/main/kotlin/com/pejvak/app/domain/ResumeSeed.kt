package com.pejvak.app.domain

/** What a resumed run hands to the next session: the old snapshot plus its speed. */
data class ResumeSeed(val conditions: PlaybackConditions, val speed: Double?)

/**
 * A run row does not store sort or audio facts; its latest session does. Fall back
 * to the type's default order when the run has no session (legacy rows), so a
 * resume never starts with an Unknown order it cannot display.
 */
fun runResumeSeed(run: ContextPlay, latestSession: Session?): ResumeSeed {
    if (latestSession != null) {
        return ResumeSeed(latestSession.playbackConditions(), latestSession.playbackSpeed)
    }
    return ResumeSeed(
        PlaybackConditions(
            contextTitle = run.contextTitle,
            collectionSort = defaultCollectionSort(run.contextType),
            collectionSortDirection = SortDirection.Asc,
        ),
        speed = null,
    )
}
