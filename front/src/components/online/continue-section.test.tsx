// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { ContinueSection } from "./continue-section";
import type { ContinueItem } from "@/lib/online/continue";

afterEach(cleanup);

const item: ContinueItem = {
  key: "archive:shabha",
  sourceId: "archive",
  externalId: "shabha",
  title: "شب‌های تهران",
  trackCount: 12,
  finishedCount: 4,
  lastIndex: 4,
  lastPositionSec: 125,
  resumeTargetSec: 125,
  collection: null,
  run: {
    clientId: "c1",
    contextType: "online",
    contextKey: "archive:shabha",
    contextTitle: "شب‌های تهران",
    trackCount: 12,
    startedAt: Date.UTC(2026, 10, 2),
    endedAt: Date.UTC(2026, 10, 2),
    lastIndex: 4,
    lastPositionSec: 125,
    listenedSec: 3600,
    finishedCount: 4,
    completed: false,
    interrupted: true,
    updatedAt: null,
  },
};

describe("ContinueSection", () => {
  it("draws nothing when there is nothing to resume", () => {
    const { container } = render(<ContinueSection items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws the shelf, its title and the way to the full shelf", () => {
    render(<ContinueSection items={[item]} />);

    expect(screen.getByRole("heading", { name: "Continue listening" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute(
      "href",
      "/browse?tab=continue",
    );
    expect(screen.getByText(item.title)).toHaveAttribute("dir", "auto");
  });

  it("states a failed read without taking the page down", () => {
    render(<ContinueSection items={[]} failure={{ kind: "offline", message: "" }} />);

    // A lost connection is a condition, not a broken section: it says so in the
    // warning channel and keeps the retry (see `ui/state.tsx`).
    expect(screen.getByText("No connection")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/");
  });
});
