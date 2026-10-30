/**
 * The decoders for the track page.
 *
 * These are the only place raw JSON from the backend becomes a type, so the two
 * contracts worth locking are:
 *
 *   · **A row that cannot be identified is dropped.** No `_id`, no `contentHash`,
 *     no `positionSec` — the decoder returns `null` and the caller filters. The
 *     alternative is an unclickable row or a note that cannot be placed on the
 *     timeline, rendered as if it were fine.
 *   · **A missing number is a default, not `NaN`.** `NaN` propagates silently
 *     through arithmetic and renders as "NaN" in a Persian page; `0` renders as
 *     "۰" and reads as "nothing recorded", which is what a missing field means.
 */

import { describe, expect, it } from "vitest";

import { parseAnnotation, parseAnnotationList } from "../domain/annotation";
import { parseTrackDetail } from "../domain/track";
import { parseSessionDetail } from "../domain/session";

const track = {
  _id: "6512a1f4c2b3d4e5f6a7b8c9",
  title: "تاریخ ایران",
  contentHash: "abc123",
  durationSec: 3600,
  origin: "local",
  annotations: [
    { _id: "a1", positionSec: 120, text: "نکتهٔ مهم", tags: ["تاریخ"], timesPlayedBefore: 2 },
    { _id: "a2", positionSec: 30, text: "" },
    { positionSec: 90, text: "بدون شناسه" },
  ],
};

describe("parseTrackDetail", () => {
  it("keeps the summary half intact", () => {
    const detail = parseTrackDetail(track);

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("6512a1f4c2b3d4e5f6a7b8c9");
    expect(detail!.title).toBe("تاریخ ایران");
    expect(detail!.durationSec).toBe(3600);
  });

  it("defaults the file facts rather than leaving them undefined", () => {
    const detail = parseTrackDetail(track);

    expect(detail!.fileSizeBytes).toBe(0);
    expect(detail!.fileName).toBeNull();
    expect(detail!.createdAt).toBeNull();
  });

  it("reads an ISO date as a timestamp", () => {
    const detail = parseTrackDetail({ ...track, createdAt: "2026-03-01T10:00:00.000Z" });

    expect(detail!.createdAt).toBe(Date.parse("2026-03-01T10:00:00.000Z"));
  });

  it("drops a note with no id and keeps the rest", () => {
    const detail = parseTrackDetail(track);

    // Three notes arrive, two are identifiable.
    expect(detail!.annotations).toHaveLength(2);
    expect(detail!.annotations.map((note) => note.id)).toEqual(["a1", "a2"]);
  });

  it("returns null when the track has no identity", () => {
    expect(parseTrackDetail({ ...track, _id: undefined })).toBeNull();
    expect(parseTrackDetail({ ...track, contentHash: "" })).toBeNull();
    expect(parseTrackDetail(null)).toBeNull();
    expect(parseTrackDetail("not a record")).toBeNull();
  });

  it("treats a missing annotations array as no notes", () => {
    const detail = parseTrackDetail({ ...track, annotations: undefined });

    expect(detail!.annotations).toEqual([]);
  });
});

describe("parseAnnotation", () => {
  it("keeps an empty note as a marker instead of dropping it", () => {
    const note = parseAnnotation({ _id: "a2", positionSec: 30, text: "" });

    // The position is the information; an empty `text` is a marker, not a bug.
    expect(note).not.toBeNull();
    expect(note!.text).toBe("");
    expect(note!.positionSec).toBe(30);
  });

  it("ignores tags that are not strings", () => {
    const note = parseAnnotation({ _id: "a3", positionSec: 1, text: "x", tags: ["ok", 7, "", null] });

    expect(note!.tags).toEqual(["ok"]);
  });

  it("defaults counters and timestamps", () => {
    const note = parseAnnotation({ _id: "a4", positionSec: 5, text: "x" });

    expect(note!.timesPlayedBefore).toBe(0);
    expect(note!.createdAt).toBeNull();
    expect(note!.color).toBeNull();
    expect(note!.clientId).toBeNull();
  });

  it("drops a note with no position", () => {
    expect(parseAnnotation({ _id: "a5", text: "بی‌جا" })).toBeNull();
  });

  it("filters a mixed list", () => {
    const list = parseAnnotationList([{ _id: "a", positionSec: 1, text: "x" }, null, 42]);

    expect(list).toHaveLength(1);
  });
});

describe("parseSessionDetail", () => {
  const session = {
    _id: "s1",
    startedAt: 1_700_000_000_000,
    durationListenedSec: 600,
    startPositionSec: 120,
    endPositionSec: 720,
    playbackSpeed: 1.5,
    completed: true,
  };

  it("keeps the timeline half", () => {
    const detail = parseSessionDetail(session);

    expect(detail!.startPositionSec).toBe(120);
    expect(detail!.endPositionSec).toBe(720);
    expect(detail!.playbackSpeed).toBe(1.5);
    expect(detail!.completed).toBe(true);
  });

  it("treats a missing speed as 1×, not 0×", () => {
    const detail = parseSessionDetail({ ...session, playbackSpeed: undefined });

    expect(detail!.playbackSpeed).toBe(1);
  });

  it("drops a session with no start time", () => {
    expect(parseSessionDetail({ ...session, startedAt: undefined })).toBeNull();
  });
});
