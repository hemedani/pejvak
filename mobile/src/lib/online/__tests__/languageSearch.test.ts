import type { OnlineLanguage } from "@/lib/online";
import { LANGUAGES, languageSearchFields } from "@/lib/online";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";

const PERSIAN = LANGUAGES.find((language) => language.code === "fa");

if (!PERSIAN) {
  throw new Error("the language catalogue lost Persian");
}

const index = createSearchIndex(LANGUAGES, languageSearchFields, "title");

function find(query: string): readonly string[] {
  return searchIndex(index, foldQuery(query)).map((hit) => hit.item.code);
}

describe("languageSearchFields", () => {
  it("indexes the name the listener recognises and the English name", () => {
    const fields = Object.fromEntries(
      languageSearchFields(PERSIAN).map((field) => [field.field, field.value]),
    );
    expect(fields.title).toBe("فارسی");
    expect(fields.name).toBe("Persian");
    expect(fields.code).toBe("fa");
  });

  it("indexes the ISO codes the archive also uses", () => {
    const alias = languageSearchFields(PERSIAN).find(
      (field) => field.field === "alias",
    )?.value;
    expect(alias).toContain("per");
    expect(alias).toContain("fas");
  });

  it("reports a missing field as null, never an empty string", () => {
    const empty: OnlineLanguage = {
      code: "fa",
      name: "",
      nativeName: "",
      direction: "rtl",
      available: true,
    };
    for (const field of languageSearchFields(empty)) {
      if (field.field !== "code" && field.field !== "alias") {
        expect(field.value).toBeNull();
      }
      expect(field.value).not.toBe("");
    }
  });
});

describe("folded language search", () => {
  it("finds Persian typed with an Arabic yeh", () => {
    expect(find("فارسي")).toContain("fa");
  });

  it("finds Persian typed with a Persian yeh", () => {
    expect(find("فارسی")).toContain("fa");
  });

  it("finds Persian typed with a ZWNJ", () => {
    expect(find("فار\u200cسی")).toContain("fa");
  });

  it("finds Persian by its English name and its ISO code", () => {
    expect(find("Persian")).toContain("fa");
    expect(find("per")).toContain("fa");
    expect(find("fa")).toContain("fa");
  });

  it("does not answer a Latin query with every language", () => {
    expect(find("Persian")).not.toContain("en");
  });
});
