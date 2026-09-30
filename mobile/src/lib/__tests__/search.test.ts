/**
 * Searching a library, and the reason it cannot be a substring test.
 *
 * The Persian cases here are not decoration: this is a Persian-first audio app
 * and the same word reaches the database written several ways — with an Arabic
 * yeh or a Persian one, with a ZWNJ or without, with Persian digits or ASCII.
 * A search that compares raw bytes finds exactly one of those spellings, which
 * for a listener who typed another one is indistinguishable from a search that
 * does not work. So the folds are the tests that matter most, and the ranking
 * tests come second.
 */

import {
  createSearchIndex,
  describeField,
  fold,
  foldQuery,
  foldText,
  highlight,
  matchOne,
  searchIndex,
  searchItems,
} from "@/lib/search";

type Field = "title" | "author" | "folder";

type Row = {
  id: string;
  title: string;
  author?: string | null;
  folder?: string | null;
};

const TITLE = "title" as const;

function fields(row: Row): { field: Field; value: string | null }[] {
  return [
    { field: "title", value: row.title },
    { field: "author", value: row.author ?? null },
    { field: "folder", value: row.folder ?? null },
  ];
}

function ids(hits: { item: Row }[]): string[] {
  return hits.map((hit) => hit.item.id);
}

describe("fold", () => {
  it("makes the Arabic and Persian spellings of one word equal", () => {
    // A keyboard set to Arabic produces ي and ك; the same words in Persian use
    // ی and ک. The listener typed a title, not a code point.
    expect(foldText("ماجراي شيعه")).toBe(foldText("ماجرای شیعه"));
    expect(foldText("ماجراي شيعه")).toBe("ماجرای شیعه");
  });

  it("drops a ZWNJ, so «نیمفاصله» and «نیمفاصله» are one word", () => {
    expect(foldText("نیم\u200cفاصله")).toBe(foldText("نیمفاصله"));
    expect(foldText("نیم\u200cفاصله")).toBe("نیمفاصله");
  });

  it("converts Persian and Arabic-Indic digits to ASCII", () => {
    expect(foldText("قسمت ۱۲")).toBe("قسمت 12");
    expect(foldText("قسمت ١٢")).toBe("قسمت 12");
  });

  it("removes harakat and tatweel, which are decoration on the same word", () => {
    expect(foldText("مُحَمَّد")).toBe("محمد");
    // A tatweel is a stretched letter, not an extra one.
    expect(foldText("کــتاب")).toBe("کتاب");
  });

  it("collapses whitespace, so a stray double space is not a different query", () => {
    expect(foldText("  الف   ب  ")).toBe("الف ب");
  });

  it("folds Latin case, so a file name is findable however it is typed", () => {
    expect(foldText("Track 01.MP3")).toBe("track 01.mp3");
  });

  it("maps every folded character back to the index it came from", () => {
    // The map is what lets a match be reported as a range in the *original*
    // string. A ZWNJ makes the folded text shorter than its source, so the two
    // indices drift apart exactly where a Persian title needs them not to.
    const { text, map } = fold("نیم\u200cفاصله");
    expect(text).toBe("نیمفاصله");
    expect(map).toHaveLength(text.length);
    expect(map).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
  });
});

describe("foldQuery", () => {
  it("splits a query into the terms that must all hit", () => {
    expect(foldQuery("تاریخ  ایران")).toEqual(["تاریخ", "ایران"]);
  });

  it("returns no terms for a query that is empty or only invisible characters", () => {
    expect(foldQuery("")).toEqual([]);
    expect(foldQuery("\u200c ")).toEqual([]);
  });
});

describe("matchOne", () => {
  it("needs every term, so a second word narrows rather than widens", () => {
    const terms = foldQuery("تاریخ ایران");
    expect(matchOne("تاریخ ایران", terms)).not.toBeNull();
    expect(matchOne("تاریخ تمدن انسان", terms)).toBeNull();
  });

  it("ranks a whole title above a prefix above a word above a substring", () => {
    expect(matchOne("فیزیک", ["فیزیک"])?.quality).toBe("exact");
    expect(matchOne("فیزیک ۱", ["فیزیک"])?.quality).toBe("prefix");
    expect(matchOne("مبانی فیزیک", ["فیزیک"])?.quality).toBe("word");
    // «متافیزیک» holds «فیزیک» mid-word — neither the start nor a new word.
    // («فیزیکدان» looks like the same case and is not: it *begins* with the
    // term, so it is a prefix, and the ranking deliberately prefers it.)
    expect(matchOne("متافیزیک", ["فیزیک"])?.quality).toBe("substring");
  });

  it("matches across a ZWNJ, which is the whole reason the fold exists", () => {
    // The listener types the two words apart because a ZWNJ is awkward to
    // produce; the source's own titles use one.
    expect(matchOne("نیزه\u200cهای کاغذی", foldQuery("نیزه های"))).not.toBeNull();
  });

  it("does not merge a spaced title with a joined query — the one gap the fold leaves", () => {
    // This documents a boundary rather than a wish. A ZWNJ folds to nothing, so
    // the ZWNJ and joined spellings are one word and the spaced spelling is a
    // different string. A spaced *query* still finds all three, because it
    // arrives as two terms and both hit. Closing this last combination needs a
    // second, space-free form of every field — see the module's header, which
    // says so on purpose.
    expect(matchOne("نیم فاصله", foldQuery("نیمفاصله"))).toBeNull();
    expect(matchOne("نیم فاصله", foldQuery("نیم فاصله"))).not.toBeNull();
    expect(matchOne("نیم\u200cفاصله", foldQuery("نیمفاصله"))).not.toBeNull();
  });

  it("reports ranges that select the original text, not the folded text", () => {
    const source = "نیم\u200cفاصله دیگر";
    const match = matchOne(source, foldQuery("فاصله"));
    expect(match?.ranges).toHaveLength(1);
    const range = match?.ranges[0];
    // The assertion that matters: the range slices the *source* back to the
    // word that was searched for. A map that was off by the ZWNJ would fail
    // here and nowhere else.
    expect(source.slice(range?.start, range?.end)).toBe("فاصله");
  });
});

describe("searchIndex", () => {
  const rows: Row[] = [
    { id: "a", title: "مبانی فیزیک", author: "مرتضی مطهری" },
    { id: "b", title: "فیزیک ۱" },
    { id: "c", title: "تاریخ تمدن انسان", folder: "فیزیک/جزوه" },
  ];

  it("finds a row through a field the listener cannot see, and says which", () => {
    const [hit] = searchItems(rows, foldQuery("مطهری"), fields, TITLE);
    expect(hit.item.id).toBe("a");
    expect(hit.field).toBe("author");
    expect(hit.value).toBe("مرتضی مطهری");
    // Nothing to highlight: the match is not in the title, so a range would
    // point at a word the row is not showing.
    expect(hit.ranges).toEqual([]);
  });

  it("finds a file by the folder it sits in", () => {
    const [hit] = searchItems(rows, foldQuery("جزوه"), fields, TITLE);
    expect(hit.item.id).toBe("c");
    expect(hit.field).toBe("folder");
  });

  it("orders by how well each row matched, whatever order the rows came in", () => {
    // "فیزیک ۱" is a prefix, the folder "فیزیک/جزوه" is a prefix too, and
    // "مبانی فیزیک" only contains the word — so the word match comes last.
    expect(ids(searchItems(rows, foldQuery("فیزیک"), fields, TITLE))).toEqual(["b", "c", "a"]);
  });

  it("prefers the title when two fields of one row match equally well", () => {
    const tie: Row[] = [{ id: "x", title: "فیزیک", author: "فیزیک" }];
    const [hit] = searchItems(tie, foldQuery("فیزیک"), fields, TITLE);
    expect(hit.field).toBe("title");
    expect(hit.ranges).toEqual([{ start: 0, end: 5 }]);
  });

  it("keeps the title even when another field matched earlier in its own text", () => {
    // Both fields match equally well, but the author's hit sits nearer the start
    // of the author string. The title must still win: it is the only field with
    // ranges to highlight, so handing the hit to the author would lose the
    // highlight and put nothing in its place.
    const row: Row[] = [{ id: "y", title: "الف فیزیک", author: "ب فیزیک" }];
    const [hit] = searchItems(row, foldQuery("فیزیک"), fields, TITLE);
    expect(hit.field).toBe("title");
    expect(hit.ranges).toEqual([{ start: 4, end: 9 }]);
  });

  it("puts the row whose match starts earlier first, at equal quality", () => {
    const late: Row[] = [
      { id: "late", title: "مبانی فیزیک" },
      { id: "early", title: "درس فیزیک" },
    ];
    expect(ids(searchItems(late, foldQuery("فیزیک"), fields, TITLE))).toEqual(["early", "late"]);
  });

  it("keeps the caller's order when two rows are equally good and start alike", () => {
    const twins: Row[] = [
      { id: "first", title: "فیزیک الف" },
      { id: "second", title: "فیزیک ب" },
    ];
    expect(ids(searchItems(twins, foldQuery("فیزیک"), fields, TITLE))).toEqual([
      "first",
      "second",
    ]);
  });

  it("drops a field with no value, so a row is never matched by a field it has not got", () => {
    // Row b has neither an author nor a folder. If an absent field were indexed
    // as an empty string, every query would match every row.
    const index = createSearchIndex(rows, fields, TITLE);
    const b = index.find((entry) => entry.item.id === "b");
    expect(b?.fields.map((entry) => entry.field)).toEqual(["title"]);
  });

  it("keeps each field's folded text, so a query never folds the data again", () => {
    // This is the contract the screen's `useMemo` depends on: the fold happens
    // once per data load, and a keystroke only runs `indexOf`.
    const index = createSearchIndex([{ id: "a", title: "ماجرای شیعه" }], fields, TITLE);
    expect(index[0].fields[0].folded.text).toBe(foldText("ماجرای شیعه"));
  });

  it("answers many queries from one index", () => {
    const index = createSearchIndex(rows, fields, TITLE);
    expect(searchIndex(index, foldQuery("فیزیک"))).toHaveLength(3);
    expect(searchIndex(index, foldQuery("تاریخ"))).toHaveLength(1);
  });

  it("returns nothing for an empty query rather than everything", () => {
    // An empty query must mean "no search", not "match all" — otherwise
    // clearing the field would filter the list down to itself.
    const index = createSearchIndex(rows, fields, TITLE);
    expect(searchIndex(index, [])).toEqual([]);
  });

  it("finds a title written with a Persian yeh from a query typed with an Arabic one", () => {
    const persian: Row[] = [{ id: "p", title: "ماجرای شیعه" }];
    expect(ids(searchItems(persian, foldQuery("ماجراي شيعه"), fields, TITLE))).toEqual(["p"]);
  });

  it("finds «قسمت ۱۲» from a query typed «قسمت 12»", () => {
    const numbered: Row[] = [{ id: "d", title: "نیزه\u200cهای کاغذی - قسمت ۱۲" }];
    expect(ids(searchItems(numbered, foldQuery("قسمت 12"), fields, TITLE))).toEqual(["d"]);
  });
});

describe("highlight", () => {
  it("returns the whole string unmarked when nothing matched", () => {
    expect(highlight("فیزیک", [])).toEqual([{ text: "فیزیک", matched: false }]);
  });

  it("splits a title around the matched run", () => {
    expect(highlight("مبانی فیزیک", [{ start: 6, end: 11 }])).toEqual([
      { text: "مبانی ", matched: false },
      { text: "فیزیک", matched: true },
    ]);
  });

  it("marks two runs separately, in order", () => {
    expect(
      highlight("تاریخ ایران", [
        { start: 0, end: 5 },
        { start: 6, end: 11 },
      ]),
    ).toEqual([
      { text: "تاریخ", matched: true },
      { text: " ", matched: false },
      { text: "ایران", matched: true },
    ]);
  });

  it("ignores a range that overlaps one already marked", () => {
    expect(
      highlight("abcdef", [
        { start: 1, end: 4 },
        { start: 2, end: 5 },
      ]),
    ).toEqual([
      { text: "a", matched: false },
      { text: "bcd", matched: true },
      { text: "ef", matched: false },
    ]);
  });

  it("reassembles the original string, whatever the ranges", () => {
    const source = "نیزه\u200cهای کاغذی - قسمت ۱۲";
    const match = matchOne(source, foldQuery("کاغذی"));
    const joined = highlight(source, match?.ranges ?? [])
      .map((segment) => segment.text)
      .join("");
    expect(joined).toBe(source);
  });
});

describe("describeField", () => {
  it("names the field so a row can explain why it is a result", () => {
    expect(describeField("fileName")).toBe("file name");
    expect(describeField("folder")).toBe("folder");
    expect(describeField("path")).toBe("path");
    expect(describeField("title")).toBe("title");
  });
});
