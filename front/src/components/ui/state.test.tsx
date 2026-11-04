// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./state";

describe("Skeleton", () => {
  it("uses the shimmer utility instead of an opacity pulse", () => {
    const { container } = render(<Skeleton className="h-8" />);
    expect(container.firstElementChild?.className).toContain("skeleton");
    expect(container.firstElementChild?.className).not.toContain("animate-pulse");
  });
});
