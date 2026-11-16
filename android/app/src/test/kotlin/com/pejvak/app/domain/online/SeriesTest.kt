package com.pejvak.app.domain.online

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SeriesTest {
    private fun shelf(vararg titles: String) = titles.toList()
    private fun titles(section: SeriesSection<String>) = section.tracks

    @Test
    fun `cuts at every spelling of a part marker`() {
        assertEquals("پادپخش تاریخ قیام سیدالشهدا", seriesNameOf("پادپخش تاریخ قیام سیدالشهدا - قسمت 1"))
        assertEquals("تاریخ انبیا", seriesNameOf("تاریخ انبیا – قسمت 12"))
        assertEquals("تاریخ انبیا", seriesNameOf("تاریخ انبیا قسمت 3"))
        assertEquals("نیزه‌های کاغذی", seriesNameOf("نیزه‌های کاغذی - قسمت 1 - حمله به افکار تو"))
        assertEquals("تاریخ تمدن انسان", seriesNameOf("تاریخ تمدن انسان 3"))
        assertEquals("ماجرای شیعه", seriesNameOf("ماجرای شیعه"))
        assertEquals("قسمت 1", seriesNameOf("قسمت 1"))
        assertEquals("تاریخ انبیا", seriesNameOf("تاریخ انبیا - قسمت ۱۲"))
        assertEquals("Deep work", seriesNameOf("Deep work 2"))
    }

    @Test
    fun `does not fold the label`() {
        val name = seriesNameOf("نیزه\u200Cهای کاغذی - قسمت 2")
        assertEquals("نیزه\u200Cهای کاغذی", name)
        assertTrue(name.contains('\u200C'))
    }

    @Test
    fun `folds four spellings of one series together`() {
        val sections = buildSeriesSections(
            shelf(
                "پادپخش تاریخ قیام سیدالشهدا - قسمت 1",
                "پادپخش تاریخ قیام سیدالشهدا - قسمت 2",
                "پادپخش تاریخ قیام سیدالشهدا – قسمت 3",
                "پادپخش تاریخ قیام سیدالشهدا قسمت 4",
            ),
        ) { it }
        assertEquals(1, sections.size)
        assertEquals("پادپخش تاریخ قیام سیدالشهدا", sections[0].title)
        assertEquals(4, sections[0].tracks.size)
    }

    @Test
    fun `groups parts that carry no word for part`() {
        val sections = buildSeriesSections(
            shelf("تاریخ تمدن انسان", "تاریخ تمدن انسان 1", "تاریخ تمدن انسان 2"),
        ) { it }
        assertEquals(1, sections.size)
        assertEquals(3, sections[0].tracks.size)
    }

    @Test
    fun `folds a subtitle away only when the prefix is a series here`() {
        val folded = buildSeriesSections(shelf("مصطفی", "مصطفی", "مصطفی - ماجرای بلال")) { it }
        assertEquals(1, folded.size)
        assertEquals("مصطفی", folded[0].title)
        assertEquals(3, folded[0].tracks.size)

        val kept = buildSeriesSections(shelf("تاریخ ایران - قاجار", "تاریخ ایران - پهلوی")) { it }
        assertEquals(1, kept.size)
        assertTrue(kept[0].standalone)
        assertEquals(2, kept[0].tracks.size)
    }

    @Test
    fun `groups arabic and persian yeh spellings, keeping the first label`() {
        val sections = buildSeriesSections(shelf("علي از زبان علي - قسمت 1", "علی از زبان علی - قسمت 2")) { it }
        assertEquals(1, sections.size)
        assertEquals("علي از زبان علي", sections[0].title)
    }

    @Test
    fun `one-offs fall into a single trailing bucket`() {
        val sections = buildSeriesSections(shelf("کتاب الف", "کتاب ب", "کتاب ج")) { it }
        assertEquals(1, sections.size)
        assertEquals(STANDALONE_KEY, sections[0].key)
        assertEquals(STANDALONE_TITLE, sections[0].title)
        assertTrue(sections[0].standalone)
        assertEquals(shelf("کتاب الف", "کتاب ب", "کتاب ج"), titles(sections[0]))
    }

    @Test
    fun `a group of one is not a section`() {
        val sections = buildSeriesSections(shelf("ماجرای شیعه - قسمت 1")) { it }
        assertTrue(sections[0].standalone)
    }

    @Test
    fun `sections keep first-episode order and standalone comes last`() {
        val sections = buildSeriesSections(
            shelf("ماجرای شیعه - قسمت 1", "ماجرای شیعه - قسمت 2", "کتاب الف", "کتاب ب"),
        ) { it }
        assertEquals(2, sections.size)
        assertEquals("ماجرای شیعه", sections[0].title)
        assertTrue(sections[1].standalone)

        val ordered = buildSeriesSections(shelf("ب - قسمت 1", "الف - قسمت 1", "ب - قسمت 2", "الف - قسمت 2")) { it }
        assertEquals(listOf("ب", "الف"), ordered.map { it.title })
    }

    @Test
    fun `empty shelf has no sections`() {
        assertTrue(buildSeriesSections(emptyList<String>()) { it }.isEmpty())
    }
}
