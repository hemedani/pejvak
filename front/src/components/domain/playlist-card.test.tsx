// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { PlaylistCard } from "./playlist-card";
import type { Playlist } from "@/lib/domain/playlist";

afterEach(cleanup);

const NOW = Date.UTC(2026, 10, 4);

const playlist: Playlist = {
  id: "p1",
  title: "شب‌های تهران",
  description: "خوانده‌شده در قطار",
  isPublic: false,
  items: [
    { trackId: "t1", order: 0 },
    { trackId: "t2", order: 1 },
  ],
  createdAt: NOW - 86_400_000,
  updatedAt: NOW - 2 * 86_400_000,
};

describe("PlaylistCard", () => {
  it("lets a listener-authored title and description set their own direction", () => {
    render(<PlaylistCard playlist={playlist} now={NOW} />);

    expect(screen.getByRole("heading", { name: playlist.title })).toHaveAttribute("dir", "auto");
    expect(screen.getByText("خوانده‌شده در قطار")).toHaveAttribute("dir", "auto");
  });

  it("sets the metadata sentence in the caption step, not the figure step", () => {
    render(<PlaylistCard playlist={playlist} now={NOW} />);

    const meta = screen.getByText(/2 tracks/);
    expect(meta).toHaveClass("type-caption");
    expect(meta).not.toHaveClass("type-numeric");
  });
});
