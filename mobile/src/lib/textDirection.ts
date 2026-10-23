/**
 * Which way a string reads, and how its block should align.
 *
 * Persian content inside an English shell is the normal case here. A title is
 * written right-to-left even when the card around it is left-to-right, and the
 * punctuation at its end belongs on its own side. But a *column* of one-word
 * language names must not alternate alignment row by row — that reads as a
 * broken table — so alignment is a property of the block, chosen by the block.
 *
 * `isRtlText` counts letters rather than checking the first character: a
 * Persian title that opens with a numeral or a quotation mark is still Persian,
 * and a Latin title carrying one Persian loanword is still Latin.
 */

const RTL_CHARS = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
const LTR_CHARS = /[A-Za-z\u00C0-\u024F]/g;

export type TextDirection = "rtl" | "ltr";

export function isRtlText(value: string): boolean {
  const rtl = value.match(RTL_CHARS)?.length ?? 0;
  if (rtl === 0) {
    return false;
  }
  const ltr = value.match(LTR_CHARS)?.length ?? 0;
  return rtl > ltr;
}

export function directionFor(value: string): TextDirection {
  return isRtlText(value) ? "rtl" : "ltr";
}

/**
 * `start` keeps the shell's alignment. `content` right-aligns only a block
 * whose own text is RTL; it is opt-in, for titles and descriptive blocks,
 * never for a single-word column or a numeric readout.
 */
export function textAlignFor(
  value: string,
  mode: "start" | "content" = "start",
): "left" | "right" {
  return mode === "content" && isRtlText(value) ? "right" : "left";
}
