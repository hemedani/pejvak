import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(new URL("./playlist-editor.tsx", import.meta.url), "utf8");

describe("playlist editor direction", () => {
  it("lets the listener's own title set its direction everywhere it is drawn", () => {
    expect(editor).toContain('<h1 dir="auto"');
    expect(editor).toContain('<p id={confirmLabelId} dir="auto"');
    expect(editor).toContain('dir="auto"\n                  label="Playlist name"');
  });

  it("keeps the figure step off prose", () => {
    expect(editor).not.toContain("type-numeric");
  });
});
