import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The review's §3.3.7 finding was not that one surface missed the reveal — it
 * was that *half* did, which reads as a bug. These are the list surfaces that
 * paint on a route change; a new one that forgets the stagger should fail here
 * rather than be noticed in a screenshot six weeks later.
 */
const SURFACES = [
  "../../app/(shell)/(home)/page.tsx",
  "../../app/(shell)/library/[trackId]/page.tsx",
  "../../app/(shell)/playlists/page.tsx",
  "../../app/(shell)/browse/source/[id]/page.tsx",
  "../domain/history-sections.tsx",
  "../domain/track-table.tsx",
  "../online/continue-shelf.tsx",
  "../online/favorite-shelf.tsx",
  "../online/language-list.tsx",
] as const;

describe("first-paint reveal coverage", () => {
  it.each(SURFACES)("staggers the rows on %s", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source.includes("<Reveal") || source.includes("reveal-row")).toBe(true);
  });
});
