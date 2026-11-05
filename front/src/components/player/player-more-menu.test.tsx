// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerMoreMenu } from "./player-more-menu";

afterEach(cleanup);

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More playback controls" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

describe("PlayerMoreMenu", () => {
  it("keeps the time utilities reachable on a narrow viewport", async () => {
    const onJump = vi.fn();
    const onSleep = vi.fn();

    render(
      <PlayerMoreMenu
        jumpDisabled={false}
        sleepLabel="Sleep timer"
        onJump={onJump}
        onSleep={onSleep}
      />,
    );

    openMenu();
    fireEvent.click(await screen.findByText("Jump to time"));
    expect(onJump).toHaveBeenCalledOnce();

    openMenu();
    fireEvent.click(await screen.findByText("Sleep timer"));
    expect(onSleep).toHaveBeenCalledOnce();
  });

  it("disables jumping on a live stream", async () => {
    render(
      <PlayerMoreMenu
        jumpDisabled
        sleepLabel="Sleep 12m"
        onJump={vi.fn()}
        onSleep={vi.fn()}
      />,
    );

    openMenu();
    expect(await screen.findByText("Jump to time")).toHaveAttribute("aria-disabled", "true");
  });
});
