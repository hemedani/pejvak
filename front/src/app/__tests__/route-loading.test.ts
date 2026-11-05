import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("route loading skeletons", () => {
  it("keeps the dashboard shape with the dashboard", () => {
    const home = read("../(shell)/(home)/loading.tsx");
    expect(home).toContain("xl:grid-cols-4");
    expect(home).toContain("length: 4");
  });

  it("does not draw the dashboard for every other route", () => {
    const root = read("../loading.tsx");
    expect(root).not.toContain("xl:grid-cols-4");
    expect(root).toContain("measure-prose");
  });
});
