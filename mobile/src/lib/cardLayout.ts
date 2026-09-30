/**
 * How a card's action cluster fits beside its text.
 *
 * This is the decision behind "responsive", and it is a pure function on
 * purpose. The alternative — measuring inside a `renderItem` and branching on
 * the result — is a layout rule that can only be observed by looking at a
 * phone, and the failure mode (a title squeezed to two characters on a small
 * screen, or a control that clips its own icon) is exactly the kind that
 * survives a code review because it looks fine on the reviewer's device.
 *
 * ## The three outcomes, in order of preference
 *
 *   1. **Inline.** Every action fits beside the copy, which keeps at least
 *      `copyMinWidth`. Nothing changes; this is the common case.
 *   2. **Reflow.** They do not fit beside it, so the cluster moves to its own
 *      line inside the card. The card grows taller and *nothing is hidden* —
 *      always preferred over an overflow menu, because a hidden control is a
 *      control the listener has to go looking for.
 *   3. **Overflow.** Even a full-width line cannot hold them all, so the
 *      lowest-priority ones collapse into a single trailing button.
 *
 * ## Why priority and not order
 *
 * The actions are declared in reading order and the row renders them in that
 * order — a toolbar that reshuffles itself as the screen narrows is worse than
 * one that drops its least important control. So the *fit* is computed by
 * priority and the *output* is re-sorted back into declaration order.
 */

/** One control in a card's action cluster. */
export type RowActionSlot = {
  key: string;
  /** Rendered width in px. */
  width: number;
  /** Higher survives longer when the row runs out of room. */
  priority: number;
};

export type RowLayoutInput = {
  /** The card's own width, in px. */
  width: number;
  /** Horizontal padding inside the card, both sides combined. */
  padding: number;
  /** The leading tile's width, or 0 when the card has none. */
  tile: number;
  /** Gap between the tile and the copy. */
  gap: number;
  /** Gap between two adjacent actions. */
  actionGap: number;
  /**
   * The narrowest the copy may become before the cluster gives up its place
   * beside it. Below roughly this, a Persian title is one letter and a
   * truncated word, which reads as a rendering bug rather than as a long name.
   */
  copyMinWidth: number;
  actions: readonly RowActionSlot[];
  /** Width of the overflow button, reserved once anything has to be dropped. */
  overflowWidth: number;
};

export type RowLayout = {
  /** Keys rendered inline, in the order they were declared. */
  inline: string[];
  /** Keys that did not fit, in the order they were declared. */
  overflow: string[];
  /** True when the cluster needs its own line. */
  reflow: boolean;
};

/** Total width of `actions` laid out in a gap-separated row. */
function spanOf(actions: readonly RowActionSlot[], gap: number): number {
  if (actions.length === 0) {
    return 0;
  }
  return (
    actions.reduce((total, action) => total + action.width, 0) + gap * (actions.length - 1)
  );
}

/**
 * Greedy by priority: which actions fit in `budget`.
 *
 * Once the whole set cannot fit, an overflow button is reserved up front. That
 * reserve is what makes the loop non-circular — whether the button is needed
 * depends on whether anything was dropped, which depends on the reserve, so the
 * decision is taken once from the *whole* set rather than re-tested per action.
 *
 * The loop `continue`s rather than `break`s: a wide control that does not fit
 * must not veto a narrow one behind it that would have.
 */
function pickInline(
  actions: readonly RowActionSlot[],
  budget: number,
  gap: number,
  overflowWidth: number,
): string[] {
  if (actions.length === 0) {
    return [];
  }
  if (spanOf(actions, gap) <= budget) {
    return actions.map((action) => action.key);
  }

  const usable = budget - (overflowWidth + gap);
  if (usable <= 0) {
    return [];
  }

  const ranked = actions
    .map((action, index) => ({ action, index }))
    // Ties keep declaration order, so a stable screen does not reshuffle.
    .sort((a, b) => b.action.priority - a.action.priority || a.index - b.index);

  const chosen: string[] = [];
  let used = 0;
  for (const { action } of ranked) {
    const cost = action.width + (chosen.length > 0 ? gap : 0);
    if (used + cost > usable) {
      continue;
    }
    chosen.push(action.key);
    used += cost;
  }
  return chosen;
}

/** Restores declaration order, keeping only the keys in `keys`. */
function inDeclarationOrder(actions: readonly RowActionSlot[], keys: readonly string[]): string[] {
  const keep = new Set(keys);
  return actions.filter((action) => keep.has(action.key)).map((action) => action.key);
}

export function planRowLayout(input: RowLayoutInput): RowLayout {
  const { actions } = input;
  if (actions.length === 0) {
    return { inline: [], overflow: [], reflow: false };
  }

  const besideCopy =
    input.width - input.padding - input.tile - input.gap - input.copyMinWidth;
  const side = pickInline(actions, besideCopy, input.actionGap, input.overflowWidth);

  if (side.length === actions.length) {
    return { inline: inDeclarationOrder(actions, side), overflow: [], reflow: false };
  }

  // The cluster lost its place beside the copy. Before hiding anything, offer
  // it the card's full width on its own line — that is the layout where the
  // copy gets the whole first line and the controls get the whole second one.
  const ownLine = pickInline(
    actions,
    input.width - input.padding,
    input.actionGap,
    input.overflowWidth,
  );

  if (ownLine.length > side.length) {
    return {
      inline: inDeclarationOrder(actions, ownLine),
      overflow: inDeclarationOrder(
        actions,
        actions.map((action) => action.key).filter((key) => !ownLine.includes(key)),
      ),
      reflow: true,
    };
  }

  return {
    inline: inDeclarationOrder(actions, side),
    overflow: inDeclarationOrder(
      actions,
      actions.map((action) => action.key).filter((key) => !side.includes(key)),
    ),
    reflow: false,
  };
}

/**
 * The width a card has to work with, without ever measuring one.
 *
 * A list row that measured itself would re-render on every layout pass, and the
 * answer it needs — "how much room is there inside my column?" — is already
 * known from three numbers: the window, the column's cap, and the column's own
 * padding. `Screen` constrains its content to `maxContentWidth` and the list
 * pads it, so those are the whole answer, and the result is available on the
 * first render rather than one frame later.
 *
 * Clamped at zero rather than allowed to go negative: a negative width would
 * make `planRowLayout`'s budget arithmetic flip sign and read as "everything
 * fits", which is the one wrong answer it could give.
 */
export function cardWidthFor(options: {
  /** The window's width. */
  windowWidth: number;
  /** Padding on ONE side of the column — the list's own horizontal padding. */
  inset: number;
  /** The column's cap, when the screen constrains its content. */
  maxContentWidth?: number;
}): number {
  const column = Math.min(options.windowWidth, options.maxContentWidth ?? Number.POSITIVE_INFINITY);
  return Math.max(0, column - options.inset * 2);
}
