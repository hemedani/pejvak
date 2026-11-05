// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyContexts: vi.fn() }));

vi.mock("@/app/actions/online/get-my-contexts", () => ({
  getMyContexts: mocks.getMyContexts,
}));

import { ContextHistoryButton, ContextHistoryList } from "./context-history-sheet";
import type { PlaybackContextRow } from "@/lib/online/types";

afterEach(cleanup);
beforeEach(() => mocks.getMyContexts.mockReset());

const finished: PlaybackContextRow = {
  clientId: "run-1",
  contextType: "online",
  contextKey: "archive:shabha",
  contextTitle: "شب‌های تهران",
  trackCount: 3,
  startedAt: Date.UTC(2026, 9, 28, 18, 30),
  endedAt: Date.UTC(2026, 9, 28, 20, 0),
  lastIndex: 2,
  lastPositionSec: 0,
  listenedSec: 5400,
  finishedCount: 3,
  completed: true,
  interrupted: false,
  updatedAt: null,
};

const open: PlaybackContextRow = {
  ...finished,
  clientId: "run-2",
  startedAt: Date.UTC(2026, 10, 3, 9, 0),
  endedAt: null,
  lastIndex: 1,
  lastPositionSec: 120,
  listenedSec: 900,
  finishedCount: 1,
  completed: false,
};

describe("ContextHistoryList", () => {
  it("reads each run's outcome and how much of the collection it covered", () => {
    render(<ContextHistoryList runs={[open, finished]} />);

    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 tracks heard")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("All 3 tracks heard")).toBeInTheDocument();
  });
});

describe("ContextHistoryButton", () => {
  it("asks for this collection's runs when the sheet opens", async () => {
    mocks.getMyContexts.mockResolvedValue({ success: true, body: [open, finished] });

    render(<ContextHistoryButton contextKey="archive:shabha" contextTitle="شب‌های تهران" />);
    fireEvent.click(screen.getByRole("button", { name: /Play-through history/ }));

    expect(await screen.findByText("In progress")).toBeInTheDocument();
    expect(mocks.getMyContexts).toHaveBeenCalledWith({ contextKey: "archive:shabha", limit: 24 });
    expect(screen.getByText("شب‌های تهران")).toHaveAttribute("dir", "auto");
  });

  it("says when there is nothing to show", async () => {
    mocks.getMyContexts.mockResolvedValue({ success: true, body: [] });

    render(<ContextHistoryButton contextKey="archive:new" contextTitle="New" />);
    fireEvent.click(screen.getByRole("button", { name: /Play-through history/ }));

    expect(await screen.findByText("No play-throughs yet")).toBeInTheDocument();
  });
});
