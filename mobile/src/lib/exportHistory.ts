import {
  describeSpeed,
  formatDuration,
  formatPositionRange,
  formatTimeRange,
  groupSessionsByDay,
  type HistoryItem,
} from "@/lib/history";

/** Renders the listening history as a portable Markdown document. */
export function historyToMarkdown(items: HistoryItem[], now: number = Date.now()): string {
  const lines: string[] = ["# Listening history"];
  const days = groupSessionsByDay(items, now);

  if (days.length === 0) {
    lines.push("", "_No sessions recorded yet._");
    return lines.join("\n");
  }

  for (const day of days) {
    lines.push("", `## ${day.label}`);
    for (const item of day.items) {
      const { session } = item;
      const outcome = session.completed
        ? " · Finished"
        : session.interrupted
          ? " · Interrupted"
          : "";
      lines.push(
        `- **${item.track.title}** — ${formatTimeRange(session.startedAt, session.endedAt)} · ` +
          `${formatDuration(session.durationListenedSec)} · ${describeSpeed(session.playbackSpeed)} · ` +
          `${formatPositionRange(session.startPositionSec, session.endPositionSec)}${outcome}`,
      );
    }
  }

  return lines.join("\n");
}
