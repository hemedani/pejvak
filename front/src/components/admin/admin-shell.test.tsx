// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { AdminNav } from "./admin-nav";
import { AdminPagination } from "./admin-pagination";

afterEach(cleanup);

describe("admin shell", () => {
  it("keeps the narrow nav's targets at the coarse-pointer minimum", () => {
    render(<AdminNav orientation="strip" />);
    expect(screen.getByRole("link", { name: /Overview/ }).className).toContain(
      "coarse:h-[var(--tap-min)]",
    );
  });

  it("keeps pagination controls at the coarse-pointer minimum", () => {
    render(
      <AdminPagination page={2} total={60} limit={25} buildHref={(next) => `/admin/users?page=${next}`} />,
    );
    expect(screen.getByRole("link", { name: /Previous/ }).className).toContain(
      "coarse:h-[var(--tap-min)]",
    );
  });

  it("marks operator-entered plan copy as data, so a Persian title sets its own direction", () => {
    const source = readFileSync("src/components/admin/plan-editor.tsx", "utf8");
    expect(source).toContain('<h2 dir="auto"');
    expect(source).toContain('<p dir="auto" className="type-caption mt-[var(--space-xs)] max-w-[70ch]');
  });
});
