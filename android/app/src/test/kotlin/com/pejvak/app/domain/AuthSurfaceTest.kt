package com.pejvak.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** SRV-03 / AUTH-13: the pure predicates behind the home-screen auth surface. */
class AuthSurfaceTest {

    @Test
    fun migrationFiresWhenEndpointChanges() {
        assertTrue(endpointNeedsMigration("http://old:1243/lesan", "http://new:1405/lesan"))
    }

    @Test
    fun migrationFiresOnFirstRunWhenNothingRecorded() {
        assertTrue(endpointNeedsMigration(null, "http://new:1405/lesan"))
    }

    @Test
    fun migrationIsIdempotentForSameEndpoint() {
        assertFalse(endpointNeedsMigration("http://new:1405/lesan", "http://new:1405/lesan"))
    }

    @Test
    fun trailingSlashAndWhitespaceAreNormalised() {
        // Equal once trimmed + slash-normalised → nothing to migrate.
        assertFalse(endpointNeedsMigration("http://new:1405/lesan/", "http://new:1405/lesan"))
        assertFalse(endpointNeedsMigration(" http://new:1405/lesan ", "http://new:1405/lesan/"))
    }

    @Test
    fun blankCurrentEndpointNeverMigrates() {
        assertFalse(endpointNeedsMigration("http://old/lesan", ""))
        assertFalse(endpointNeedsMigration(null, "  "))
    }

    @Test
    fun buttonStateReflectsSessionAndQueue() {
        assertEquals(AccountButtonState.NeedsSignIn, accountButtonState(signedIn = false, pendingTotal = 0))
        assertEquals(AccountButtonState.NeedsSignIn, accountButtonState(signedIn = false, pendingTotal = 42))
        assertEquals(AccountButtonState.Queued, accountButtonState(signedIn = true, pendingTotal = 3))
        assertEquals(AccountButtonState.UpToDate, accountButtonState(signedIn = true, pendingTotal = 0))
    }

    @Test
    fun onlyUpToDateHasNoAttentionDot() {
        assertFalse(AccountButtonState.UpToDate.needsAttention())
        assertTrue(AccountButtonState.Queued.needsAttention())
        assertTrue(AccountButtonState.NeedsSignIn.needsAttention())
    }

    @Test
    fun glyphKeysAreDistinct() {
        val keys = AccountButtonState.entries.map { it.glyphKey() }
        assertEquals(keys.size, keys.toSet().size)
    }
}
