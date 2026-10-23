/**
 * The status vocabulary.
 *
 * A completed listen, a downloaded course, a failed download, a missing file
 * and the current track are five different things, but they belong to one
 * visual language: a glyph, a word, and a tone. What they must not each invent
 * is their own mapping from state to drawing.
 *
 * The words belong to the domain that knows the state (`history.ts`,
 * `folderPlay.ts`, `online`). This module owns only the kinds and the type, so
 * `lib` never has to import an icon, and `StatusLine` never has to know what a
 * session is.
 */

export const STATUS_KINDS = [
  "complete",
  "finished",
  "interrupted",
  "continued",
  "stopped",
  "downloaded",
  "downloading",
  "failed",
  "paused",
  "missing",
  "streamed",
  "favorite",
  "current",
  "warning",
  "info",
] as const;

export type StatusKind = (typeof STATUS_KINDS)[number];

export type StatusTone = "accent" | "danger" | "secondary" | "tertiary";

export type StatusSpec = {
  kind: StatusKind;
  /** The domain's word — "Complete", "Downloaded", "File missing". */
  label: string;
  /** Optional override; `StatusLine` has a default per kind. */
  tone?: StatusTone;
};

const STATUS_SET: ReadonlySet<string> = new Set(STATUS_KINDS);

export function isStatusKind(value: string): value is StatusKind {
  return STATUS_SET.has(value);
}
