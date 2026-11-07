import type { AnnotationWithTrack } from "@/lib/db/types";
import {
  describeNoteFacts,
  describeNoteTimeline,
  noteMarkers,
  noteResumeParams,
} from "@/lib/noteDetail";

function note(
  annotation: Partial<AnnotationWithTrack["annotation"]> = {},
  track: Partial<AnnotationWithTrack["track"]> = {},
): AnnotationWithTrack {
  return {
    annotation: {
      id: "a1",
      serverId: null,
      trackId: "t1",
      contentHash: "hash-1",
      positionSec: 90,
      text: "The bit about tides",
      tags: [],
      color: null,
      timesPlayedBefore: 0,
      deletedAt: null,
      syncStatus: "synced",
      // A fixed instant, so the date facts do not depend on when the suite runs.
      createdAt: new Date(2026, 2, 9, 14, 5).getTime(),
      updatedAt: 0,
      ...annotation,
    },
    track: {
      id: "t1",
      title: "Chapter 3",
      author: "Ada",
      contentHash: "hash-1",
      artworkUrl: null,
      origin: "local",
      folderName: null,
      collectionTitle: null,
      ...track,
    },
  };
}

describe("noteResumeParams", () => {
  it("reopens the track the note was written in, at the note's second", () => {
    expect(noteResumeParams(note())).toEqual({
      trackId: "t1",
      positionSec: "90",
    });
  });

  it("sends the position as a string, which is what a route param is", () => {
    // The player reads `positionSec` off the params object, where every value
    // has already been through the URL.
    expect(typeof noteResumeParams(note()).positionSec).toBe("string");
  });
});

describe("noteMarkers", () => {
  const siblings = [
    { id: "a1", positionSec: 90 },
    { id: "a2", positionSec: 30 },
    { id: "a3", positionSec: 300 },
  ];

  it("places every note on the track, in order", () => {
    expect(noteMarkers(600, siblings, "a1").map((marker) => marker.ratio)).toEqual([
      0.05,
      0.15,
      0.5,
    ]);
  });

  it("marks exactly one of them as the one being read", () => {
    const markers = noteMarkers(600, siblings, "a2");
    expect(markers.filter((marker) => marker.current).map((marker) => marker.id)).toEqual([
      "a2",
    ]);
  });

  it("includes the open note among its neighbours rather than beside them", () => {
    // The bar must not end up with two ticks for one note.
    expect(noteMarkers(600, siblings, "a1")).toHaveLength(siblings.length);
  });

  it("draws nothing when the track's length is unknown", () => {
    // A ratio would be a division by zero, and a tick pinned to the left edge
    // would be the sheet asserting a position it does not have.
    expect(noteMarkers(null, siblings, "a1")).toEqual([]);
    expect(noteMarkers(0, siblings, "a1")).toEqual([]);
  });

  it("clamps a note that sits past the track's reported end", () => {
    // Durations are read from tags and can be short; a tick at 120% would be
    // drawn outside the bar.
    const markers = noteMarkers(100, [{ id: "a1", positionSec: 400 }], "a1");
    expect(markers[0]?.ratio).toBe(1);
  });
});

describe("describeNoteTimeline", () => {
  it("says how many notes share the track", () => {
    expect(describeNoteTimeline(3)).toBe("3 notes on this track");
  });

  it("says when it is the only one", () => {
    expect(describeNoteTimeline(1)).toBe("The only note on this track");
    // A track with no markers at all still reads as a sentence, not as "0 notes".
    expect(describeNoteTimeline(0)).toBe("The only note on this track");
  });
});

describe("describeNoteFacts", () => {
  it("leads with when it was written and where it sits", () => {
    const facts = describeNoteFacts(note(), 600);
    expect(facts.slice(0, 3)).toEqual([
      { label: "Date", value: new Date(2026, 2, 9).toLocaleDateString() },
      {
        label: "Time",
        value: new Date(2026, 2, 9, 14, 5).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      { label: "Position", value: "1:30 of 10:00" },
    ]);
  });

  it("states the position alone while the track's length is unknown", () => {
    const facts = describeNoteFacts(note(), null);
    expect(facts.find((fact) => fact.label === "Position")?.value).toBe("1:30");
  });

  it("leaves out the facts that are not there", () => {
    const labels = describeNoteFacts(
      note({ tags: [], timesPlayedBefore: 1 }, { author: null }),
      null,
    ).map((fact) => fact.label);
    expect(labels).toEqual(["Date", "Time", "Position"]);
  });

  it("names the container when it is not simply the track's own name", () => {
    const facts = describeNoteFacts(note({}, { folderName: "Lectures" }), null);
    expect(facts.find((fact) => fact.label === "Collection")?.value).toBe("Lectures");

    const repeated = describeNoteFacts(note({}, { folderName: "Chapter 3" }), null);
    expect(repeated.some((fact) => fact.label === "Collection")).toBe(false);
  });

  it("writes the tags back the way the row does", () => {
    const facts = describeNoteFacts(note({ tags: ["history", "lecture"] }), null);
    expect(facts.find((fact) => fact.label === "Tags")?.value).toBe(
      "#history #lecture",
    );
  });

  it("only mentions the play count once there had been more than one", () => {
    // "Written on play 1" is every note ever written on a new track.
    const first = describeNoteFacts(note({ timesPlayedBefore: 1 }), null);
    expect(first.some((fact) => fact.label === "Written on")).toBe(false);

    const fourth = describeNoteFacts(note({ timesPlayedBefore: 4 }), null);
    expect(fourth.find((fact) => fact.label === "Written on")?.value).toBe("play 4");
  });
});
