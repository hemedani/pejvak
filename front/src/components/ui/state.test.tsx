// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton } from "./state";

afterEach(cleanup);

describe("Skeleton", () => {
  it("uses the shimmer utility instead of an opacity pulse", () => {
    const { container } = render(<Skeleton className="h-8" />);
    expect(container.firstElementChild?.className).toContain("skeleton");
    expect(container.firstElementChild?.className).not.toContain("animate-pulse");
  });
});
