// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./button";

// `vitest.config.ts` sets `globals: false`, so Testing Library cannot register
// its automatic cleanup; without this the first render leaks into the next test.
afterEach(cleanup);

describe("Button", () => {
  it("sizes controls from the control tokens", () => {
    render(<Button size="md">Play</Button>);
    expect(screen.getByRole("button").className).toContain("h-[var(--control-md)]");
  });

  it("grows the dense variants on coarse pointers", () => {
    render(<Button size="sm">Save</Button>);
    expect(screen.getByRole("button").className).toContain("coarse:h-[var(--control-md)]");
  });
});
