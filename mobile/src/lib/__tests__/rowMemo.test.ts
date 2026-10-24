import type { LocalDownloadJob, LocalTrack } from "../db/types";
import { onlineTrackRowPropsEqual, rangesEqual, statusEqual } from "../rowMemo";

function track(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: "t1",
    title: "Episode 1",
    durationSec: 600,
    downloadedAt: null,
    ...overrides,
  } as LocalTrack;
}

function job(overrides: Partial<LocalDownloadJob> = {}): LocalDownloadJob {
  return {
    id: "j1",
    state: "running",
    bytesDone: 10,
    bytesTotal: 100,
    ...overrides,
  } as LocalDownloadJob;
}

const press = () => {};

function props(overrides: Record<string, unknown> = {}) {
  return {
    track: track(),
    ordinal: 1,
    isCurrent: false,
    job: job(),
    onPress: press,
    ...overrides,
  };
}

describe("rangesEqual", () => {
  it("compares ranges by value, not by array identity", () => {
    expect(rangesEqual([{ start: 1, end: 3 }], [{ start: 1, end: 3 }])).toBe(true);
  });

  it("notices a moved range and a length change", () => {
    expect(rangesEqual([{ start: 1, end: 3 }], [{ start: 1, end: 4 }])).toBe(false);
    expect(rangesEqual([{ start: 1, end: 3 }], [])).toBe(false);
  });

  it("treats undefined and an empty list as the same absence", () => {
    expect(rangesEqual(undefined, [])).toBe(true);
  });
});

describe("statusEqual", () => {
  it("compares the kind, label and tone", () => {
    expect(
      statusEqual({ kind: "downloaded", label: "On device" }, { kind: "downloaded", label: "On device" }),
    ).toBe(true);
    expect(
      statusEqual({ kind: "downloaded", label: "On device" }, { kind: "downloaded", label: "On disk" }),
    ).toBe(false);
  });
});

describe("onlineTrackRowPropsEqual", () => {
  it("ignores a new job object with identical numbers", () => {
    expect(onlineTrackRowPropsEqual(props(), props({ job: job() }))).toBe(true);
  });

  it("notices a changed byte count and a changed state", () => {
    expect(onlineTrackRowPropsEqual(props(), props({ job: job({ bytesDone: 11 }) }))).toBe(false);
    expect(onlineTrackRowPropsEqual(props(), props({ job: job({ state: "done" }) }))).toBe(false);
  });

  it("notices a null job appearing or disappearing", () => {
    expect(onlineTrackRowPropsEqual(props({ job: null }), props({ job: job() }))).toBe(false);
    expect(onlineTrackRowPropsEqual(props({ job: job() }), props({ job: null }))).toBe(false);
  });

  it("notices a download landing on the track", () => {
    expect(onlineTrackRowPropsEqual(props(), props({ track: track({ downloadedAt: 5 }) }))).toBe(
      false,
    );
  });

  it("notices a changed title, ordinal, current flag and press handler", () => {
    expect(onlineTrackRowPropsEqual(props(), props({ track: track({ title: "Other" }) }))).toBe(false);
    expect(onlineTrackRowPropsEqual(props(), props({ ordinal: 2 }))).toBe(false);
    expect(onlineTrackRowPropsEqual(props(), props({ isCurrent: true }))).toBe(false);
    expect(onlineTrackRowPropsEqual(props(), props({ onPress: () => {} }))).toBe(false);
  });

  it("notices its card edge moving between first, middle and last", () => {
    expect(
      onlineTrackRowPropsEqual(props({ position: "first" }), props({ position: "middle" })),
    ).toBe(false);
  });

  it("notices the measured card width changing on rotation", () => {
    expect(onlineTrackRowPropsEqual(props({ cardWidth: 320 }), props({ cardWidth: 420 }))).toBe(
      false,
    );
  });
});
