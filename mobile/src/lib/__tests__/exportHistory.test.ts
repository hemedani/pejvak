import type { LocalSession } from "@/lib/db/types";
import { historyToMarkdown } from "@/lib/exportHistory";
import type { HistoryItem } from "@/lib/history";

const NOW = new Date(2026, 8, 11, 12, 0).getTime();

function item(overrides: Partial<LocalSession> = {}): HistoryItem {
  return {
    session: {
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
      completed: false,
      interrupted: false,
      deviceInfo: null,
      syncStatus: "synced",
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    },
    track: { id: "t1", title: "Moby Dick", author: null, contentHash: "hash-1" },
  };
}

describe("historyToMarkdown", () => {
  it("renders an empty history", () => {
    expect(historyToMarkdown([], NOW)).toBe(
      "# Listening history\n\n_No sessions recorded yet._",
    );
  });

  it("groups by day and renders each session", () => {
    const markdown = historyToMarkdown([item()], NOW);
    expect(markdown).toBe(
      "# Listening history\n\n## Today\n- **Moby Dick** — 09:15 – 09:22 · 5m · 1× · 0:00 – 5:00",
    );
  });

  it("marks completed and interrupted sessions", () => {
    const markdown = historyToMarkdown(
      [item({ completed: true }), item({ id: "s2", interrupted: true })],
      NOW,
    );
    expect(markdown).toContain("0:00 – 5:00 · Finished");
    expect(markdown).toContain("0:00 – 5:00 · Interrupted");
  });
});
