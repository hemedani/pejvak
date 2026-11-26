package com.pejvak.app.data.remote.online

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShariatiParserTest {
    private val html = """
        <html><body>
          <main class="audiobooks">
            <article class="book">
              <div class="episode">
                <h2><p>بازگشت به خویشتن — بخش یک</p></h2>
                <audio controls>
                  <source src="http://dl.drshariati.com/media/bazgasht-1.mp3" type="audio/mpeg">
                </audio>
              </div>
              <div class="episode">
                <h2><p>بازگشت به خویشتن — بخش دو</p></h2>
                <audio controls>
                  <source src="https://dl.drshariati.com/media/bazgasht-2.mp3" type="audio/mpeg">
                </audio>
              </div>
            </article>
          </main>
        </body></html>
    """.trimIndent()

    @Test
    fun `parseEpisodes reads the title from the smallest enclosing block`() {
        val episodes = parseEpisodes(html)

        assertEquals(2, episodes.size)
        assertEquals("بازگشت به خویشتن — بخش یک", episodes[0].title)
        assertEquals("https://dl.drshariati.com/media/bazgasht-1.mp3", episodes[0].streamUrl)
        assertEquals("بازگشت به خویشتن — بخش دو", episodes[1].title)
        assertEquals("https://dl.drshariati.com/media/bazgasht-2.mp3", episodes[1].streamUrl)
    }

    @Test
    fun `parseEpisodes deduplicates repeated stream urls`() {
        val repeated = """
            <div><p>One</p><audio><source src="https://dl.drshariati.com/a.mp3"></audio></div>
            <div><p>One again</p><audio><source src="https://dl.drshariati.com/a.mp3"></audio></div>
            <div><p>Two</p><audio><source src="https://dl.drshariati.com/b.mp3"></audio></div>
        """.trimIndent()

        assertEquals(2, parseEpisodes(repeated).size)
    }

    @Test
    fun `countAudioEpisodes matches the parsed episode count`() {
        assertEquals(parseEpisodes(html).size, countAudioEpisodes(html))
        assertEquals(2, countAudioEpisodes(html))
        assertEquals(0, countAudioEpisodes("<html><body><p>No audio here</p></body></html>"))
    }

    @Test
    fun `parseEpisodes stays linear enough for a large catalogue page`() {
        val block = """
            <div class="episode"><p>Episode</p>
            <audio><source src="https://dl.drshariati.com/media/track.mp3"></audio></div>
        """.trimIndent()
        val huge = buildString {
            append("<html><body><main>")
            repeat(20) { index ->
                append(block.replace("track.mp3", "track-$index.mp3"))
                repeat(30) { append("<div class=\"filler\"><span>x</span></div>") }
            }
            append("</main></body></html>")
        }

        val started = System.nanoTime()
        val episodes = parseEpisodes(huge)
        val elapsedMs = (System.nanoTime() - started) / 1_000_000

        assertEquals(20, episodes.size)
        assertTrue("parse took ${elapsedMs}ms", elapsedMs < 2_000)
    }
}
