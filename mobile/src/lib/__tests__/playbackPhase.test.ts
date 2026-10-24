import {
  describeWait,
  isWaiting,
  resolvePlaybackPhase,
  resolveWaitStage,
  WAIT_LONG_MS,
  WAIT_REVEAL_MS,
  type PlaybackWait,
} from "@/lib/playbackPhase";

/**
 * The phase exists because `playing` is not evidence of anything audible:
 * ExoPlayer reports the *intended* state, so a stream's first buffer arrives
 * with `playing: true` and no sound. A screen that trusted it drew a pause
 * button over silence, which is why the wait has to outrank it.
 */
describe("resolvePlaybackPhase", () => {
  const connecting: PlaybackWait = { kind: "connecting", since: 1000, stream: true };
  const buffering: PlaybackWait = { kind: "buffering", since: 1000, stream: true };

  it("reports the wait, not the intended state, while a stream is fetching", () => {
    expect(
      resolvePlaybackPhase({ status: "playing", waiting: connecting, error: null }),
    ).toBe("connecting");
    expect(
      resolvePlaybackPhase({ status: "playing", waiting: buffering, error: null }),
    ).toBe("buffering");
  });

  it("reports playing once the wait has cleared", () => {
    expect(
      resolvePlaybackPhase({ status: "playing", waiting: null, error: null }),
    ).toBe("playing");
  });

  it("lets an error outrank a wait — the wait is over, and it ended badly", () => {
    expect(
      resolvePlaybackPhase({
        status: "error",
        waiting: connecting,
        error: "The source did not respond.",
      }),
    ).toBe("error");
  });

  it("treats an error message with a stale status as an error too", () => {
    expect(
      resolvePlaybackPhase({ status: "playing", waiting: null, error: "Gone" }),
    ).toBe("error");
  });

  it("keeps a load with no wait reading as connecting rather than paused", () => {
    // Should not happen — `loadAndPlay` sets both — but a pause would be a lie
    // about a track that is being prepared.
    expect(
      resolvePlaybackPhase({ status: "loading", waiting: null, error: null }),
    ).toBe("connecting");
  });

  it("passes the resting states through", () => {
    expect(resolvePlaybackPhase({ status: "idle", waiting: null, error: null })).toBe("idle");
    expect(resolvePlaybackPhase({ status: "paused", waiting: null, error: null })).toBe("paused");
    expect(resolvePlaybackPhase({ status: "ended", waiting: null, error: null })).toBe("ended");
  });

  it("knows which phases are a wait", () => {
    expect(isWaiting("connecting")).toBe(true);
    expect(isWaiting("buffering")).toBe(true);
    expect(isWaiting("playing")).toBe(false);
    expect(isWaiting("paused")).toBe(false);
  });
});

/**
 * Two boundaries, and the first one is a hold-back rather than a stage: a local
 * file opens faster than the eye registers a loader, and drawing one anyway is
 * a flicker that makes the app look slower than it is.
 */
describe("resolveWaitStage", () => {
  it("says nothing about a wait that is already over", () => {
    expect(resolveWaitStage(0)).toBe("hidden");
    expect(resolveWaitStage(WAIT_REVEAL_MS - 1)).toBe("hidden");
  });

  it("admits to the wait once it is long enough to notice", () => {
    expect(resolveWaitStage(WAIT_REVEAL_MS)).toBe("early");
    expect(resolveWaitStage(WAIT_LONG_MS - 1)).toBe("early");
  });

  it("explains itself once the wait has gone on", () => {
    expect(resolveWaitStage(WAIT_LONG_MS)).toBe("long");
    expect(resolveWaitStage(WAIT_LONG_MS * 10)).toBe("long");
  });
});

describe("describeWait", () => {
  const stream: PlaybackWait = { kind: "connecting", since: 0, stream: true };
  const file: PlaybackWait = { kind: "connecting", since: 0, stream: false };
  const stall: PlaybackWait = { kind: "buffering", since: 0, stream: true };

  it("names the network when the bytes come from a source", () => {
    expect(describeWait(stream, "early")).toEqual({
      label: "Connecting to the source…",
      detail: null,
    });
  });

  it("does not claim to be connecting to a source when it is opening a file", () => {
    expect(describeWait(file, "early")).toEqual({
      label: "Preparing audio…",
      detail: null,
    });
  });

  it("separates a stall from a first connect", () => {
    // A buffering track is already the listener's: saying "connecting" would
    // suggest it is being fetched from scratch.
    expect(describeWait(stall, "early").label).toBe("Buffering…");
    expect(describeWait(stream, "early").label).toBe("Connecting to the source…");
  });

  it("adds a sentence only once the wait has gone on", () => {
    expect(describeWait(stream, "early").detail).toBeNull();
    expect(describeWait(stream, "long").detail).not.toBeNull();
    expect(describeWait(stall, "long").detail).not.toBeNull();
    expect(describeWait(file, "long").detail).not.toBeNull();
  });
});
