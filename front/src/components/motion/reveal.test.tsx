// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Reveal } from "./reveal";

afterEach(cleanup);

describe("Reveal", () => {
  it("caps the stagger delay at ten steps", () => {
    render(<Reveal index={99}>content</Reveal>);
    const element = screen.getByText("content");
    expect(element.className).toContain("reveal");
    expect(element.style.animationDelay).toBe("450ms");
  });

  it("does not delay the first item", () => {
    render(<Reveal index={0}>first</Reveal>);
    expect(screen.getByText("first").style.animationDelay).toBe("");
  });
});
