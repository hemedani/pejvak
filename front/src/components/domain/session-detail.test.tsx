// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SessionDetailPanel,
  SessionDetailTrigger,
  SessionDisclosure,
} from "./session-detail";
import type { ListeningStretch } from "@/lib/history";

afterEach(cleanup);

/**
 * One listen: a single track, heard from 0:00 to 12:00 of a 40-minute file.
 *
 * Deliberately one member with a collection, because that is the shape that
 * produces both the timeline and the longest fact value — the pair the sheet
 * this replaced had to scroll for.
 */
const stretch: ListeningStretch = {
  id: "stretch-1",
  startedAt: Date.UTC(2026, 10, 3, 21, 14),
  endedAt: Date.UTC(2026, 10, 3, 21, 26),
  startTrackId: "track-1",
  startContentHash: "hash-1",
  startPositionSec: 0,
  endTrackId: "track-1",
  endContentHash: "hash-1",
  endPositionSec: 720,
  trackCount: 1,
  listenedSec: 720,
  playbackSpeed: 1.25,
  seeked: false,
  completed: false,
  interrupted: false,
  contextPlayId: null,
  contextType: "online",
  contextKey: "archive:shabha",
  isComplete: false,
  members: [
    {
      id: "session-1",
      contentHash: "hash-1",
      track: {
        id: "track-1",
        contentHash: "hash-1",
        title: "Chapter four",
        durationSec: 2400,
        author: "Sima Bina",
        narrator: null,
        artworkUrl: null,
        origin: "online",
        sourceId: "archive",
        externalId: "shabha",
        collectionKey: "archive:shabha",
        collectionTitle: "شب‌های تهران",
      },
      startedAt: Date.UTC(2026, 10, 3, 21, 14),
      endedAt: Date.UTC(2026, 10, 3, 21, 26),
      startPositionSec: 0,
      endPositionSec: 720,
      durationListenedSec: 720,
      playbackSpeed: 1.25,
      completed: false,
      interrupted: false,
      seeked: false,
      stretchId: "stretch-1",
      contextPlayId: null,
      contextType: "online",
      contextKey: "archive:shabha",
    },
  ],
};

function Row() {
  return (
    <SessionDisclosure>
      <SessionDetailTrigger title="Chapter four" />
      <SessionDetailPanel stretch={stretch} />
    </SessionDisclosure>
  );
}

function trigger() {
  return screen.getByRole("button", { name: /timeline for chapter four/i });
}

function panelFor(element: HTMLElement) {
  const id = element.getAttribute("aria-controls");
  if (!id) throw new Error("the trigger does not point at a panel");
  const panel = document.getElementById(id);
  if (!panel) throw new Error("aria-controls names an element that is not rendered");
  return panel;
}

describe("the timeline disclosure", () => {
  it("starts collapsed and says so", () => {
    render(<Row />);

    const button = trigger();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panelFor(button)).toHaveAttribute("data-open", "false");
  });

  /**
   * The panel stays mounted so it can animate shut, which means its contents are
   * in the DOM while it is zero pixels tall. `inert` is what keeps them out of
   * the tab order and the accessibility tree — without it a collapsed row would
   * still hand a keyboard user four links they cannot see.
   */
  it("keeps a collapsed panel out of the tab order", () => {
    render(<Row />);

    const panel = panelFor(trigger());
    expect(panel.hasAttribute("inert")).toBe(true);

    fireEvent.click(trigger());

    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("opens in place, and closes again", () => {
    render(<Row />);

    const button = trigger();
    const panel = panelFor(button);

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-open", "true");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("data-open", "false");
  });

  /**
   * The reason this stopped being a dialog. A disclosure must not move focus:
   * the reader opened one row, and the next Tab should reach the row's next
   * control rather than being pulled into a panel they did not ask to enter.
   */
  it("leaves focus on the trigger", () => {
    render(<Row />);

    const button = trigger();
    button.focus();
    fireEvent.click(button);

    expect(button).toHaveFocus();
  });

  it("shows the timeline and the facts the row could not carry", () => {
    render(<Row />);
    fireEvent.click(trigger());

    // The bar's own caption, which is the question the row raised.
    expect(screen.getByText(/heard of/i)).toBeInTheDocument();
    expect(screen.getByText("Listened")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("1.25×")).toBeInTheDocument();
    expect(screen.getByText("شب‌های تهران")).toBeInTheDocument();
  });

  /**
   * WCAG 2.5.3: the accessible name has to *contain* the visible label. The row
   * name is appended, not substituted — "Timeline for Chapter four" passes,
   * "Show the timeline" would not, because someone using voice control says the
   * word they can see.
   */
  it("names the row without dropping the visible word", () => {
    render(<Row />);

    const button = trigger();
    expect(button).toHaveTextContent("Timeline");
    expect(button).toHaveAccessibleName(/^Timeline for Chapter four/);
  });
});
