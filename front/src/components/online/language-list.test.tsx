// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { LanguageRow } from "./language-list";
import type { OnlineLanguage } from "@/lib/online/types";

afterEach(cleanup);

const persian: OnlineLanguage = {
  code: "fa",
  name: "Persian",
  nativeName: "فارسی",
  direction: "rtl",
  available: true,
};

describe("LanguageRow", () => {
  it("pins a right-to-left name to the shell's alignment", () => {
    render(<LanguageRow language={persian} />);
    const native = screen.getByText("فارسی");
    expect(native).toHaveAttribute("dir", "rtl");
    expect(native.parentElement).toHaveAttribute("dir", "ltr");
  });

  it("keeps the English name as the list's small print", () => {
    render(<LanguageRow language={persian} />);
    expect(screen.getAllByText("Persian").length).toBeGreaterThan(0);
  });
});
