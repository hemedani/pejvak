import type { LocalSession } from "@/lib/db/types";
import { historyToMarkdown } from "@/lib/exportHistory";
import {
  groupHistoryIntoStretches,
  type HistoryItem,
  type HistoryStretch,
} from "@/lib/history";

const NOW = new Date(2026, 8, 11, 12, 0).getTime();

function session(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "s1",
    serverId: null,
    trackId: "t1",
    contentHash: "hash-1",
    startedAt: new Date(2026, 8, 11, 9, 15).getTime(),
    endedAt: new Date(2026, 8, 11, 9, 22).getTime(),
    startPositionSec: 0,
    endPositionSec: 300,
    durationListenedSec: 300,
    playbackSpeed: 1,
    completed: true,
    interrupted: false,
    deviceInfo: null,
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: overrides.stretchId ?? overrides.id ?? "s1",
    seeked: false,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function row(title: string, overrides: Partial<LocalSession> = {}): HistoryItem {
  return {
    session: session(overrides),
    track: {
      id: "t1",
      title,
      author: null,
      contentHash: "hash-1",
      isAudiobook: true,
      artworkUrl: null,
    },
    contextTitle: null,
  };
}

/** The one listen those rows make up. */
function stretch(...rows: HistoryItem[]): HistoryStretch {
  const [entry] = groupHistoryIntoStretches(rows);
  if (!entry) {
    throw new Error(`no stretch was built from ${rows.length} rows`);
  }
  return entry;
}

describe("historyToMarkdown", () => {
  it("renders an empty history", () => {
    expect(historyToMarkdown([], NOW)).toBe(
      "# Listening history\n\n_No listens recorded yet._",
    );
  });

  it("renders a listen heard through with the word that marks it", () => {
    const markdown = historyToMarkdown([stretch(row("Moby Dick"))], NOW);

    expect(markdown).toBe(
      "# Listening history\n\n## Today\n- **Moby Dick** — 09:15 – 09:22 · 5m · 1× · 0:00 – 5:00 · Complete",
    );
  });

  it("keeps a scrubbed listen apart from one heard through", () => {
    // The screen says this with a border and an accent colour; a plain-text
    // document has only the word, so an export that called both of them
    // "Finished" would drop the distinction the feature exists to make.
    const markdown = historyToMarkdown([stretch(row("Moby Dick", { seeked: true }))], NOW);

    expect(markdown).toContain("0:00 – 5:00 · Finished");
    expect(markdown).not.toContain("Complete");
  });

  it("marks a listen that stopped early as interrupted", () => {
    const markdown = historyToMarkdown(
      [stretch(row("Moby Dick", { completed: false, interrupted: true }))],
      NOW,
    );

    expect(markdown).toContain("0:00 – 5:00 · Interrupted");
  });

  it("names both ends of a listen that covered more than one track", () => {
    const markdown = historyToMarkdown(
      [
        stretch(
          row("Moby Dick", { id: "s1", stretchId: "stretch-1" }),
          row("The Whale", {
            id: "s2",
            stretchId: "stretch-1",
            startedAt: new Date(2026, 8, 11, 9, 22).getTime(),
          }),
        ),
      ],
      NOW,
    );

    expect(markdown).toContain("**Moby Dick → The Whale**");
    expect(markdown).toContain("· 2 tracks");
    // A single-track listen says "1 track" nowhere; the same rule holds here.
    expect(historyToMarkdown([stretch(row("Moby Dick"))], NOW)).not.toContain("1 track");
  });

  it("groups listens by the day they began", () => {
    const markdown = historyToMarkdown(
      [
        stretch(row("Today's chapter")),
        stretch(
          row("Last night's chapter", {
            id: "s9",
            startedAt: new Date(2026, 8, 10, 23, 40).getTime(),
          }),
        ),
      ],
      NOW,
    );

    expect(markdown).toContain("## Today");
    expect(markdown).toContain("## Yesterday");
  });
});
