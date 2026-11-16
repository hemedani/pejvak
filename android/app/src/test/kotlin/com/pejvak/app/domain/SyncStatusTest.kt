package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The account screen's sync copy is derived, not hand-written per screen: the
 * queue sentence, the relative "last synced" label and the history meter all
 * come from these pure helpers (mirrors mobile's use-sync-status + settings).
 */
class SyncStatusTest {

    @Test
    fun `empty queue says everything is on the server`() {
        assertEquals(
            "Everything on this device is on the server.",
            describePendingQueue(0, 0, 0, 0, 0, 0),
        )
    }

    @Test
    fun `queue lists only the tables that hold work, with plurals`() {
        assertEquals(
            "2 tracks · 1 session · 3 notes · 1 playlist · 2 online collections",
            describePendingQueue(2, 1, 3, 1, 0, 2),
        )
    }

    @Test
    fun `queue includes runs when present`() {
        assertEquals(
            "1 collection run",
            describePendingQueue(0, 0, 0, 0, 1, 0),
        )
    }

    @Test
    fun `last synced never`() {
        assertEquals("Never synced", describeLastSync(null, now = 1_000_000))
        assertEquals("Never synced", describeLastSync(0, now = 1_000_000))
    }

    @Test
    fun `last synced relative buckets`() {
        val now = 10_000_000_000L
        assertEquals("Just now", describeLastSync(now - 30_000, now))
        assertEquals("5 min ago", describeLastSync(now - 5 * 60_000, now))
        assertEquals("1 hour ago", describeLastSync(now - 3_600_000, now))
        assertEquals("3 hours ago", describeLastSync(now - 3 * 3_600_000, now))
        assertEquals("1 day ago", describeLastSync(now - 86_400_000, now))
        assertEquals("4 days ago", describeLastSync(now - 4 * 86_400_000, now))
    }

    @Test
    fun `a clock that moved backwards reads as just now`() {
        assertEquals("Just now", describeLastSync(now = 100, lastSyncAt = 5_000))
    }

    @Test
    fun `history quota hidden when unlimited or unknown`() {
        assertNull(describeHistoryQuota(null))
        assertNull(describeHistoryQuota(HistoryQuota(limit = -1, used = 900, remaining = -1, unlimited = true)))
    }

    @Test
    fun `history quota prints used of limit`() {
        assertEquals(
            "412 of 500 history entries used",
            describeHistoryQuota(HistoryQuota(limit = 500, used = 412, remaining = 88, unlimited = false)),
        )
    }
}
