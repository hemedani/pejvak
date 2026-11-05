// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ListeningTimelineBar } from "./listening-timeline";
import type { ListeningTimeline, TimelineSegment } from "@/lib/listeningTimeline";

afterEach(cleanup);

function segment(overrides: Partial<TimelineSegment>): TimelineSegment {
  return {
    key: "s1",
    trackId: "t1",
    contentHash: "h1",
    title: "Track",
    fromSec: 0,
    toSec: 0,
    durationSec: 600,
    listenedSec: 0,
    seeked: false,
    completed: false,
    from: 0,
    to: 0,
    weight: 1,
    ...overrides,
  };
}

function timeline(segments: TimelineSegment[]): ListeningTimeline {
  return {
    segments,
    totalDurationSec: 600,
    heardSec: 600,
    ratio: 1,
    markerRatio: 0.5,
    seeked: segments.some((s) => s.seeked),
  };
}

describe("ListeningTimelineBar", () => {
  it("lists each track and what was heard of it, for a reader that cannot see the strip", () => {
    render(
      <ListeningTimelineBar
        tint="#123456"
        timeline={timeline([
          segment({ key: "a", title: "Chapter one", toSec: 600, completed: true }),
          segment({ key: "b", title: "Chapter two", fromSec: 30, toSec: 90, seeked: true }),
          segment({ key: "c", title: "Chapter three", toSec: null }),
        ])}
      />,
    );

    expect(screen.getByText("Tracks in this listen")).toBeInTheDocument();
    expect(screen.getByText("Chapter one")).toHaveAttribute("dir", "auto");
    expect(screen.getByText("0:00 to 10:00, heard through")).toBeInTheDocument();
    expect(screen.getByText("0:30 to 1:30, jumped")).toBeInTheDocument();
    expect(screen.getByText("Still listening")).toBeInTheDocument();
  });

  it("renders no transcript when nothing was heard", () => {
    render(<ListeningTimelineBar tint="#123456" timeline={timeline([])} />);
    expect(screen.queryByText("Tracks in this listen")).not.toBeInTheDocument();
  });
});
