// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TrackTable } from "./track-table";
import type { TrackSummary } from "@/lib/domain/track";
import { formatRelativeTime } from "@/lib/time";

const NOW = Date.UTC(2026, 10, 4);
const createdAt = NOW - 2 * 86_400_000;

const track = {
  id: "t1", title: "Sapiens", contentHash: "hash", durationSec: 3600,
  isAudiobook: true, author: "Yuval Noah Harari", narrator: null, artworkUrl: null,
  totalPlayCount: 7, totalListenTimeSec: 600, lastPlayedAt: null, createdAt,
  origin: "online", sourceId: "s", externalId: "e", collectionKey: "s:e",
  collectionTitle: null,
} as TrackSummary;

describe("TrackTable", () => {
  it("shows when the track was added under the Added column", () => {
    render(
      <TrackTable
        tracks={[track]}
        sort={{ field: "createdAt", order: "desc" }}
        buildSortHref={() => "#"}
        now={NOW}
      />,
    );
    expect(screen.getAllByText(formatRelativeTime(createdAt, NOW)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/7 plays/)).toBeNull();
  });

  it("marks catalogue text as auto-direction so a Persian title renders RTL", () => {
    const persian = { ...track, title: "تاریخ شیعه" } as TrackSummary;
    render(
      <TrackTable
        tracks={[persian]}
        sort={{ field: "createdAt", order: "desc" }}
        buildSortHref={() => "#"}
        now={NOW}
      />,
    );
    expect(screen.getAllByText("تاریخ شیعه")[0]).toHaveAttribute("dir", "auto");
  });
});
