// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TopTracksTable } from "./top-tracks-table";
import type { TopTrackRow } from "@/lib/insights";

afterEach(cleanup);

const NOW = Date.UTC(2026, 10, 4);

const row: TopTrackRow = {
  contentHash: "hash",
  title: "Sapiens",
  id: "t1",
  durationSec: 3600,
  listenTimeSec: 600,
  playCount: 7,
  lastPlayedAt: null,
};

describe("TopTracksTable", () => {
  it("gives a row with no cover the track's palette tile", () => {
    const { container } = render(<TopTracksTable rows={[row]} now={NOW} />);
    expect(container.querySelector('[style*="linear-gradient"]')).not.toBeNull();
  });
});
