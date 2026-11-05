// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatCell } from "./stat-cell";

afterEach(cleanup);

describe("StatCell", () => {
  it("makes the figure the loudest text in the card", () => {
    render(
      <StatCell
        label="Total listening time"
        value="12h 4m"
        detail="Since yesterday"
        icon="clock"
      />,
    );

    const value = screen.getByText("12h 4m");
    expect(value.className).toContain("type-figure");
    expect(value.className).toContain("text-text");
    expect(value.className).not.toContain("text-text-secondary");

    const label = screen.getByText("Total listening time");
    expect(label.className).toContain("text-text-secondary");
    expect(label.className.split(/\s+/)).not.toContain("text-text");
  });
});
