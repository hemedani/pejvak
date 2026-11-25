package com.pejvak.app.di

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the upload OkHttp client timeouts (plan 07, the "upload timeout" fix). A real
 * audiobook is tens–hundreds of MB and the live server ingest is bandwidth-bound (~72 s
 * for 30 MB), so the upload client MUST NOT keep OkHttp's 10 s read/write defaults —
 * those aborted the body mid-transfer and the app surfaced OkHttp's "timeout". The
 * client keeps a 30 s connect timeout (fail fast on an unreachable host) but disables
 * read/write/call timeouts for the long transfer.
 */
class UploadClientTimeoutTest {

    @Test
    fun uploadClientHasNoReadOrWriteTimeout() {
        val client = AppModule.provideOkHttpClient()
        assertEquals("connect timeout stays bounded", 30_000, client.connectTimeoutMillis)
        assertEquals("write timeout disabled for large bodies", 0, client.writeTimeoutMillis)
        assertEquals("read timeout disabled for slow server ingest", 0, client.readTimeoutMillis)
        assertEquals("no overall call timeout", 0, client.callTimeoutMillis)
        assertTrue("retry on connection failure", client.retryOnConnectionFailure)
    }
}
