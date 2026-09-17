import { readFilenameTags, stripExtension } from "@/lib/filenameTags";

describe("stripExtension", () => {
  it("removes a trailing extension", () => {
    expect(stripExtension("03 - Foo.mp3")).toBe("03 - Foo");
    expect(stripExtension("no-extension")).toBe("no-extension");
  });

  it("keeps a leading dot as part of the name", () => {
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
});

describe("readFilenameTags", () => {
  it("reads a leading track number and the title after it", () => {
    expect(readFilenameTags("03 - Thermodynamics.mp3")).toEqual({
      title: "Thermodynamics",
      trackNumber: 3,
      year: null,
    });
  });

  it("accepts underscores and dots as separators", () => {
    expect(readFilenameTags("03_Thermodynamics.mp3").trackNumber).toBe(3);
    expect(readFilenameTags("07. Chapter Seven.mp3")).toEqual({
      title: "Chapter Seven",
      trackNumber: 7,
      year: null,
    });
  });

  it("reads a date prefix as a year", () => {
    expect(readFilenameTags("2024-03-12 Lecture 4.mp3")).toEqual({
      title: "Lecture 4",
      trackNumber: null,
      year: 2024,
    });
  });

  it("reads a compact date prefix", () => {
    expect(readFilenameTags("20240312 Lecture.mp3")).toEqual({
      title: "Lecture",
      trackNumber: null,
      year: 2024,
    });
  });

  it("does not read a year-like leading number as a track number", () => {
    // The trap: `1984 Part One` must not become track 198 of "4 Part One".
    expect(readFilenameTags("1984 Part One.mp3")).toEqual({
      title: "1984 Part One",
      trackNumber: null,
      year: null,
    });
  });

  it("reads a trailing track number", () => {
    expect(readFilenameTags("Thermodynamics - 03.mp3")).toEqual({
      title: "Thermodynamics",
      trackNumber: 3,
      year: null,
    });
  });

  it("leaves a title that merely contains a number alone", () => {
    expect(readFilenameTags("Lecture 10.mp3")).toEqual({
      title: "Lecture 10",
      trackNumber: null,
      year: null,
    });
  });

  it("rejects an impossible date and keeps the raw stem", () => {
    expect(readFilenameTags("2024-13-45 Foo.mp3")).toEqual({
      title: "2024-13-45 Foo",
      trackNumber: null,
      year: null,
    });
  });

  it("normalises underscores when there is no number to extract", () => {
    expect(readFilenameTags("no_extension")).toEqual({
      title: "no extension",
      trackNumber: null,
      year: null,
    });
  });

  it("keeps the date as the title when nothing follows it", () => {
    expect(readFilenameTags("2024-03-12.mp3")).toEqual({
      title: "2024-03-12",
      trackNumber: null,
      year: 2024,
    });
  });

  it("returns empty tags for an empty name", () => {
    expect(readFilenameTags("")).toEqual({ title: null, trackNumber: null, year: null });
  });
});
