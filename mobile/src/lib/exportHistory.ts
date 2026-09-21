import {
  describeSpeed,
  describeStretchTitle,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  groupByDay,
  type HistoryStretch,
} from "@/lib/history";
import { describeStretchOutcome, describeStretchTracks } from "@/lib/listeningStretch";

/**
 * The word a listen gets in the export, one per outcome.
 *
 * "Complete" is the one that matters: the History screen marks a listen heard
 * from the first second through to the last end, and a plain-text document has
 * no border or accent colour to carry that — the word is the whole marker, so
 * an export that only said "Finished" would lose the distinction entirely.
 */
const OUTCOME_LABELS: Record<ReturnType<typeof describeStretchOutcome>, string> = {
  complete: "Complete",
  finished: "Finished",
  interrupted: "Interrupted",
  open: "",
};

/**
 * Renders the listening history as a portable Markdown document.
 *
 * A listen per line, not a track per line: the document is the same list the
 * History screen shows, and a stretch that covered three chapters reads as one
 * entry naming both ends. Rows are already the members of whole stretches —
 * the query selects by stretch — so nothing here has to re-group them.
 */
export function historyToMarkdown(
  stretches: HistoryStretch[],
  now: number = Date.now(),
): string {
  const lines: string[] = ["# Listening history"];
  const days = groupByDay(stretches, (entry) => entry.stretch.startedAt, now);

  if (days.length === 0) {
    lines.push("", "_No listens recorded yet._");
    return lines.join("\n");
  }

  for (const day of days) {
    lines.push("", `## ${day.label}`);
    for (const entry of day.items) {
      const { stretch } = entry;
      const outcome = OUTCOME_LABELS[describeStretchOutcome(stretch)];
      lines.push(
        `- **${describeStretchTitle(entry)}** — ${formatTimeRange(stretch.startedAt, stretch.endedAt)} · ` +
          `${formatDuration(stretch.listenedSec)} · ${describeSpeed(stretch.playbackSpeed)} · ` +
          `${formatPositionRange(stretch.startPositionSec, stretch.endPositionSec)}` +
          // Only when it covered more than one: "1 track" is noise on a line
          // whose headline is already a single title.
          `${stretch.trackCount > 1 ? ` · ${describeStretchTracks(stretch)}` : ""}` +
          `${outcome ? ` · ${outcome}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}
