// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/library" }));

import { PageTransition } from "./page-transition";

describe("PageTransition", () => {
  it("renders its children inside the page-enter wrapper", () => {
    render(<PageTransition>page body</PageTransition>);
    expect(screen.getByText("page body")).toHaveClass("page-enter");
  });
});
