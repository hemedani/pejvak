import type { LocalAnnotation, LocalTrack } from "@/lib/db/types";
import { formatClock } from "@/lib/time";

type TrackMeta = Pick<LocalTrack, "title" | "author">;
type AnnotationMeta = Pick<LocalAnnotation, "positionSec" | "text" | "tags">;

/** Renders a track's annotations as a portable Markdown document. */
export function annotationsToMarkdown(
  track: TrackMeta,
  annotations: AnnotationMeta[],
): string {
  const lines: string[] = [`# ${track.title.trim() || "Untitled"}`];
  if (track.author) {
    lines.push("", `_by ${track.author}_`);
  }
  lines.push("");

  const sorted = [...annotations].sort((a, b) => a.positionSec - b.positionSec);
  if (sorted.length === 0) {
    lines.push("_No annotations yet._");
    return lines.join("\n");
  }

  for (const note of sorted) {
    const tags = note.tags.length > 0 ? ` ${note.tags.map((tag) => `#${tag}`).join(" ")}` : "";
    lines.push(`- **[${formatClock(note.positionSec)}]** ${note.text.trim()}${tags}`);
  }
  return lines.join("\n");
}
