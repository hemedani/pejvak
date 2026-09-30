/**
 * The series grouping, against the shapes the live titles actually have.
 *
 * Every fixture below is a real episode title (trimmed) from manahej.ir, and
 * they are here verbatim because the rule exists for *these* strings: a marker
 * that is sometimes last and sometimes followed by a subtitle, a separator that
 * is `-`, `–` or absent, a series whose parts carry no word for "part", and two
 * shows that share a prefix and must not be merged.
 *
 * The last of those is the one worth guarding. A grouping rule that folds every
 * title at its last ` - ` looks correct on «مصطفی - ماجرای بلال» and silently
 * destroys «تاریخ ایران - قاجار» — so the merge is only allowed when the prefix
 * is a series *in this collection*, and there is a test below that fails if
 * someone relaxes it to a plain cut.
 */

import {
  buildSeriesSections,
  seriesNameOf,
  STANDALONE_KEY,
  STANDALONE_TITLE,
  type SeriesSection,
} from "@/lib/online/series";

/** The only field the grouping reads. */
function shelf(...titles: string[]): { title: string }[] {
  return titles.map((title) => ({ title }));
}

function titlesOf(section: SeriesSection<{ title: string }>): string[] {
  return section.tracks.map((track) => track.title);
}

/** ZWNJ, written as an escape so it cannot be lost in an edit. */
const ZWNJ = "\u200C";

describe("seriesNameOf", () => {
  it("cuts at a part marker after a dash", () => {
    expect(seriesNameOf("پادپخش تاریخ قیام سیدالشهدا - قسمت 1")).toBe(
      "پادپخش تاریخ قیام سیدالشهدا",
    );
  });

  it("cuts at a part marker after an en dash", () => {
    expect(seriesNameOf("تاریخ انبیا – قسمت 12")).toBe("تاریخ انبیا");
  });

  it("cuts at a part marker with no separator at all", () => {
    expect(seriesNameOf("تاریخ انبیا قسمت 3")).toBe("تاریخ انبیا");
  });

  it("drops the subtitle that follows the marker", () => {
    expect(seriesNameOf("نیزه‌های کاغذی - قسمت 1 - حمله به افکار تو")).toBe("نیزه‌های کاغذی");
  });

  it("strips a bare trailing number", () => {
    expect(seriesNameOf("تاریخ تمدن انسان 3")).toBe("تاریخ تمدن انسان");
  });

  it("leaves a title with no marker and no number alone", () => {
    expect(seriesNameOf("ماجرای شیعه")).toBe("ماجرای شیعه");
  });

  it("keeps a title that begins with the marker, rather than emptying it", () => {
    expect(seriesNameOf("قسمت 1")).toBe("قسمت 1");
  });

  it("reads Persian digits", () => {
    expect(seriesNameOf("تاریخ انبیا - قسمت ۱۲")).toBe("تاریخ انبیا");
  });

  it("does not fold the label — a ZWNJ survives", () => {
    const name = seriesNameOf(`نیزه${ZWNJ}های کاغذی - قسمت 2`);
    expect(name).toBe(`نیزه${ZWNJ}های کاغذی`);
    expect(name).toContain(ZWNJ);
  });

  it("does not read a marker out of the middle of a word", () => {
    // "Deep work" contains "ep"; a rule that scanned without a separator would
    // cut it to "D".
    expect(seriesNameOf("Deep work 2")).toBe("Deep work");
  });
});

describe("buildSeriesSections", () => {
  it("folds the four spellings of one marker into one series", () => {
    const sections = buildSeriesSections(
      shelf(
        "پادپخش تاریخ قیام سیدالشهدا - قسمت 1",
        "پادپخش تاریخ قیام سیدالشهدا - قسمت 2",
        "پادپخش تاریخ قیام سیدالشهدا – قسمت 3",
        "پادپخش تاریخ قیام سیدالشهدا قسمت 4",
      ),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("پادپخش تاریخ قیام سیدالشهدا");
    expect(sections[0].tracks).toHaveLength(4);
    expect(sections[0].standalone).toBe(false);
  });

  it("groups a series whose episodes carry a subtitle after the marker", () => {
    const sections = buildSeriesSections(
      shelf(
        "نیزه‌های کاغذی - قسمت 1 - حمله به افکار تو",
        "نیزه‌های کاغذی - قسمت 2 - چیز دیگری",
      ),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("نیزه‌های کاغذی");
  });

  it("groups a series whose later parts carry no word for 'part'", () => {
    const sections = buildSeriesSections(
      shelf("تاریخ تمدن انسان", "تاریخ تمدن انسان 1", "تاریخ تمدن انسان 2"),
    );

    expect(sections).toHaveLength(1);
    expect(titlesOf(sections[0])).toEqual([
      "تاریخ تمدن انسان",
      "تاریخ تمدن انسان 1",
      "تاریخ تمدن انسان 2",
    ]);
  });

  it("folds a subtitle away when the prefix is a series here", () => {
    // The case the evidence rule exists for: «مصطفی» runs 23 episodes and one
    // sibling carries a subtitle instead of a part marker.
    const sections = buildSeriesSections(
      shelf("مصطفی", "مصطفی", "مصطفی - ماجرای بلال"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("مصطفی");
    expect(sections[0].tracks).toHaveLength(3);
  });

  it("refuses to fold two shows that merely share a prefix", () => {
    // Nothing here is called «تاریخ ایران», so the prefix is not a series and
    // the two subtitles are two different shows. A plain cut at the last ` - `
    // would merge them; this test is what stops that change being made.
    const sections = buildSeriesSections(
      shelf("تاریخ ایران - قاجار", "تاریخ ایران - پهلوی"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].standalone).toBe(true);
    expect(titlesOf(sections[0])).toEqual(["تاریخ ایران - قاجار", "تاریخ ایران - پهلوی"]);
  });

  it("groups the same series written with an Arabic yeh and a Persian one", () => {
    const sections = buildSeriesSections(
      shelf("علي از زبان علي - قسمت 1", "علی از زبان علی - قسمت 2"),
    );

    expect(sections).toHaveLength(1);
    // The label keeps the first spelling seen, never the folded form.
    expect(sections[0].title).toBe("علي از زبان علي");
  });

  it("groups the same marker written with Persian and ASCII digits", () => {
    const sections = buildSeriesSections(
      shelf("تاریخ انبیا - قسمت ۱", "تاریخ انبیا - قسمت 2"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].tracks).toHaveLength(2);
  });

  it("falls every one-off into a single trailing bucket, in order", () => {
    const sections = buildSeriesSections(shelf("کتاب الف", "کتاب ب", "کتاب ج"));

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(STANDALONE_KEY);
    expect(sections[0].title).toBe(STANDALONE_TITLE);
    expect(sections[0].standalone).toBe(true);
    expect(titlesOf(sections[0])).toEqual(["کتاب الف", "کتاب ب", "کتاب ج"]);
  });

  it("does not make a section out of a group of one", () => {
    const sections = buildSeriesSections(shelf("ماجرای شیعه - قسمت 1"));

    expect(sections).toHaveLength(1);
    expect(sections[0].standalone).toBe(true);
  });

  it("puts the standalone bucket last, after every real series", () => {
    const sections = buildSeriesSections(
      shelf(
        "ماجرای شیعه - قسمت 1",
        "ماجرای شیعه - قسمت 2",
        "کتاب الف",
        "کتاب ب",
      ),
    );

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("ماجرای شیعه");
    expect(sections[1].standalone).toBe(true);
    expect(titlesOf(sections[1])).toEqual(["کتاب الف", "کتاب ب"]);
  });

  it("orders sections by their first episode, not by size", () => {
    // «الف» is the larger series but starts second; the shelf keeps the
    // collection's own order so a listener finds the shows where they left them.
    const sections = buildSeriesSections(
      shelf("ب - قسمت 1", "الف - قسمت 1", "ب - قسمت 2", "الف - قسمت 2"),
    );

    expect(sections.map((section) => section.title)).toEqual(["ب", "الف"]);
  });

  it("groups a real category's shelf into its series", () => {
    // The shape of «تاریخ شیعه»: three interleaved series plus one-offs.
    const sections = buildSeriesSections(
      shelf(
        "ماجرای شیعه - قسمت 1",
        "تاریخ از زبان علی - قسمت 1",
        "نیزه‌های کاغذی - قسمت 1",
        "ماجرای شیعه - قسمت 2",
        "تاریخ از زبان علی - قسمت 2",
        "ماجرای شیعه - قسمت 3",
        "یک برنامه جدا",
      ),
    );

    expect(sections.map((section) => section.title)).toEqual([
      "ماجرای شیعه",
      "تاریخ از زبان علی",
      STANDALONE_TITLE,
    ]);
    expect(sections.map((section) => section.tracks.length)).toEqual([3, 2, 2]);
    expect(sections[2].standalone).toBe(true);
    // «نیزههای کاغذی» reached one episode here, so it is not a section — it
    // falls into the bucket like any other one-off. That is the same rule that
    // keeps «خلاصه کتاب»'s 22 one-book summaries from becoming 22 sections of
    // one, and it is why the bucket has to exist at all.
    expect(titlesOf(sections[2])).toEqual(["نیزه‌های کاغذی - قسمت 1", "یک برنامه جدا"]);
  });

  it("returns nothing for an empty collection", () => {
    expect(buildSeriesSections([])).toEqual([]);
  });
});
