import { annotationsToMarkdown } from "@/lib/exportAnnotations";

type Note = { positionSec: number; text: string; tags: string[] };

function note(overrides: Partial<Note> = {}): Note {
  return { positionSec: 30, text: "note", tags: [], ...overrides };
}

describe("annotationsToMarkdown", () => {
  it("renders a title and author header", () => {
    const markdown = annotationsToMarkdown({ title: "Moby Dick", author: "Melville" }, []);
    expect(markdown).toBe("# Moby Dick\n\n_by Melville_\n\n_No annotations yet._");
  });

  it("sorts notes by position and timestamps each one", () => {
    const markdown = annotationsToMarkdown({ title: "Book", author: null }, [
      note({ positionSec: 90, text: "later" }),
      note({ positionSec: 5, text: "earlier" }),
    ]);
    expect(markdown).toBe("# Book\n\n- **[0:05]** earlier\n- **[1:30]** later");
  });

  it("appends tags as hashtags", () => {
    const markdown = annotationsToMarkdown({ title: "Book", author: null }, [
      note({ text: "insight", tags: ["theme", "quote"] }),
    ]);
    expect(markdown).toBe("# Book\n\n- **[0:30]** insight #theme #quote");
  });

  it("trims note text and falls back to Untitled", () => {
    const markdown = annotationsToMarkdown({ title: "  ", author: null }, [
      note({ text: "  spaced  " }),
    ]);
    expect(markdown).toBe("# Untitled\n\n- **[0:30]** spaced");
  });
});
