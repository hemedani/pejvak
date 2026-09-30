/**
 * The card layout rule.
 *
 * Three promises are being pinned here, and each is one the brief asked for in
 * words rather than in code:
 *
 *   - **nothing clips** — every action is either inline or explicitly listed as
 *     overflow, never silently dropped;
 *   - **the copy stays readable** — the cluster may not take the width the text
 *     needs, whatever the screen;
 *   - **reflow beats hiding** — a cluster that lost its place beside the copy
 *     moves to its own line rather than collapsing into a menu.
 *
 * The widths are arithmetic, not measurements. A phone is 320–430 pt wide, and
 * the point of the module is that the outcome for any width is decidable
 * without one — so the cases below are mostly real phone widths, and the two
 * that are not are labelled as mechanism probes.
 */

import { cardWidthFor, planRowLayout, type RowActionSlot } from "@/lib/cardLayout";

/** A 40 pt control, which is what every icon button in the app is. */
function action(key: string, priority: number, width = 40): RowActionSlot {
  return { key, width, priority };
}

/** The Library row: 20 pt of list padding each side, a 44 pt tile, 12 pt gap. */
const LIBRARY_ROW = {
  padding: 24,
  tile: 44,
  gap: 12,
  actionGap: 8,
  copyMinWidth: 132,
  overflowWidth: 40,
};

describe("planRowLayout", () => {
  it("keeps every action inline when they all fit", () => {
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width: 430,
      actions: [action("play", 3), action("add", 2), action("history", 2)],
    });

    expect(layout).toEqual({
      inline: ["play", "add", "history"],
      overflow: [],
      reflow: false,
    });
  });

  it("reports no actions as no actions", () => {
    const layout = planRowLayout({ ...LIBRARY_ROW, width: 390, actions: [] });

    expect(layout).toEqual({ inline: [], overflow: [], reflow: false });
  });

  it("reflows the cluster to its own line rather than hiding anything", () => {
    // 320 - 24 - 44 - 12 - 132 = 108 pt beside the copy, and the three 40 pt
    // controls need 136. They do fit across the card's full 296 pt, so the row
    // grows a second line and all three survive.
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width: 320,
      actions: [action("play", 3), action("add", 2), action("history", 2)],
    });

    expect(layout.reflow).toBe(true);
    expect(layout.inline).toEqual(["play", "add", "history"]);
    expect(layout.overflow).toEqual([]);
  });

  it("reflows exactly when the copy would drop below its minimum, and not before", () => {
    // 136 pt of cluster + 24 padding + 44 tile + 12 gap + 132 copy = 348, which
    // is the last width where they still fit beside the copy. One point less
    // and the copy would be squeezed, so the cluster moves down instead.
    const actions = [action("play", 3), action("add", 2), action("history", 2)];

    expect(planRowLayout({ ...LIBRARY_ROW, width: 348, actions }).reflow).toBe(false);
    expect(planRowLayout({ ...LIBRARY_ROW, width: 347, actions }).reflow).toBe(true);
  });

  it("collapses the lowest priority into the overflow only when even a full line cannot hold them", () => {
    // Five 40 pt controls span 232 pt, and 260 - 24 = 236 pt of line would hold
    // them — so it takes a slightly narrower card for overflow to bite at all.
    // That is the intended shape of the rule: overflow is the last resort.
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width: 250,
      actions: [
        action("play", 5),
        action("add", 4),
        action("history", 3),
        action("download", 2),
        action("more", 1),
      ],
    });

    // 226 pt of line, less the 48 pt reserved for the overflow button, holds
    // three at 3*40 + 2*8 = 136; a fourth would need 184.
    expect(layout.reflow).toBe(true);
    expect(layout.inline).toEqual(["play", "add", "history"]);
    expect(layout.overflow).toEqual(["download", "more"]);
  });

  it("drops by priority, but renders in declaration order", () => {
    // Declared back to front on purpose. The three that survive are the three
    // most important; the order they come out in is the order they were
    // declared, because a toolbar that reshuffles itself as the screen narrows
    // is worse than one that drops its least important control.
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width: 250,
      actions: [
        action("more", 1),
        action("download", 2),
        action("history", 3),
        action("add", 4),
        action("play", 5),
      ],
    });

    expect(layout.inline).toEqual(["history", "add", "play"]);
    expect(layout.overflow).toEqual(["more", "download"]);
  });

  it("does not let a wide control veto a narrow one behind it", () => {
    // A mechanism probe: a card with no tile, 150 pt wide, holding a 100 pt
    // action at top priority and a 40 pt one at the bottom. The wide action
    // cannot fit in the 78 pt of usable line, but the narrow one can — a
    // `break` where the fit loop has a `continue` would report an empty cluster
    // and hide a control that would have fitted.
    const layout = planRowLayout({
      width: 150,
      padding: 24,
      tile: 0,
      gap: 0,
      actionGap: 8,
      copyMinWidth: 100,
      overflowWidth: 40,
      actions: [action("wide", 9, 100), action("narrow", 1, 40)],
    });

    expect(layout.inline).toEqual(["narrow"]);
    expect(layout.overflow).toEqual(["wide"]);
  });

  it("never hides a control from a two-control card, however narrow", () => {
    // The floor of the rule: a cluster of two always fits on its own line, so a
    // card that has only a play button and one other control never grows a menu.
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width: 260,
      actions: [action("play", 3), action("history", 2)],
    });

    expect(layout.reflow).toBe(true);
    expect(layout.inline).toEqual(["play", "history"]);
    expect(layout.overflow).toEqual([]);
  });

  it("moves even a single control down rather than squeezing the copy", () => {
    // 40 + 24 + 44 + 12 + 132 = 252 is the last width where one 40 pt control
    // still fits beside a copy that keeps its minimum. Below it the control
    // moves to its own line — the copy never gives up a character to hold a
    // button, and nothing is hidden.
    const actions = [action("play", 3)];

    const fits = planRowLayout({ ...LIBRARY_ROW, width: 252, actions });
    expect(fits.reflow).toBe(false);
    expect(fits.inline).toEqual(["play"]);

    const reflows = planRowLayout({ ...LIBRARY_ROW, width: 251, actions });
    expect(reflows.reflow).toBe(true);
    expect(reflows.inline).toEqual(["play"]);
    expect(reflows.overflow).toEqual([]);
  });

  it("accounts for every action exactly once, at every width", () => {
    // The promise the brief actually makes — "nothing clips" — stated as an
    // invariant rather than as a case: whatever the width, every action is
    // either inline or in the overflow, and never both.
    const actions = [
      action("play", 5),
      action("add", 4),
      action("history", 3),
      action("download", 2),
      action("more", 1),
    ];
    const declared = actions.map((entry) => entry.key);

    for (let width = 120; width <= 520; width += 1) {
      const layout = planRowLayout({ ...LIBRARY_ROW, width, actions });
      const placed = [...layout.inline, ...layout.overflow];

      expect(placed.slice().sort()).toEqual(declared.slice().sort());
      expect(layout.inline.length + layout.overflow.length).toBe(actions.length);
      // Inline order is always the declared order.
      expect(layout.inline).toEqual(declared.filter((key) => layout.inline.includes(key)));
    }
  });
});

describe("cardWidthFor", () => {
  it("takes the list's padding off both sides of the column", () => {
    // A 390 pt phone, 20 pt of list padding each side.
    expect(cardWidthFor({ windowWidth: 390, inset: 20 })).toBe(350);
  });

  it("caps at the column's max width on a wide screen", () => {
    // The screen constrains its content to 760 pt, so a tablet's extra width is
    // not the card's to use — the card is 760 - 40, not 1024 - 40.
    expect(cardWidthFor({ windowWidth: 1024, inset: 20, maxContentWidth: 760 })).toBe(720);
  });

  it("uses the window when it is narrower than the cap", () => {
    expect(cardWidthFor({ windowWidth: 320, inset: 20, maxContentWidth: 760 })).toBe(280);
  });

  it("never reports a negative width", () => {
    // A window narrower than the padding, which a negative width would turn into
    // a budget that reads as "everything fits" — the one wrong answer available.
    expect(cardWidthFor({ windowWidth: 10, inset: 20 })).toBe(0);
  });

  it("feeds a real phone's card a layout that keeps three controls inline", () => {
    // The two modules joined up: a 390 pt phone's card is 350 pt wide, which is
    // past the 348 pt threshold the row test pins, so the Library's three
    // controls stay beside the copy rather than reflowing on the common case.
    const width = cardWidthFor({ windowWidth: 390, inset: 20 });
    const layout = planRowLayout({
      ...LIBRARY_ROW,
      width,
      actions: [action("play", 3), action("add", 2), action("history", 2)],
    });

    expect(layout.reflow).toBe(false);
    expect(layout.overflow).toEqual([]);
  });
});
