import { COMPLETION_EPSILON_SEC, clampResumePosition, resumePositionSec } from "@/lib/resume";

type Session = {
  startedAt: number;
  endedAt: number | null;
  endPositionSec: number | null;
};

function session(overrides: Partial<Session> = {}): Session {
  return {
    startedAt: 100,
    endedAt: 200,
    endPositionSec: 120,
    ...overrides,
  };
}

describe("resumePositionSec", () => {
  it("returns 0 when there are no sessions", () => {
    expect(resumePositionSec([], 3600)).toBe(0);
  });

  it("resumes from the most recent finished session", () => {
    const sessions = [
      session({ startedAt: 100, endPositionSec: 300 }),
      session({ startedAt: 500, endPositionSec: 900 }),
    ];
    expect(resumePositionSec(sessions, 3600)).toBe(900);
  });

  it("ignores sessions that never ended", () => {
    const sessions = [
      session({ startedAt: 100, endPositionSec: 300 }),
      session({ startedAt: 500, endedAt: null, endPositionSec: null }),
    ];
    expect(resumePositionSec(sessions, 3600)).toBe(300);
  });

  it("starts over when the track was completed", () => {
    expect(resumePositionSec([session({ endPositionSec: 3600 })], 3600)).toBe(0);
    expect(resumePositionSec([session({ endPositionSec: 3596 })], 3600)).toBe(0);
  });

  it("returns the raw position when the duration is unknown", () => {
    expect(resumePositionSec([session({ endPositionSec: 5000 })], 0)).toBe(5000);
  });

  it("treats a zero or negative position as the start", () => {
    expect(resumePositionSec([session({ endPositionSec: 0 })], 3600)).toBe(0);
    expect(resumePositionSec([session({ endPositionSec: -10 })], 3600)).toBe(0);
  });
});

/**
 * Folder play resolves resume positions from its own query and applies this
 * helper directly, so the epsilon rule has to hold on a bare number — not only
 * on a session list.
 */
describe("clampResumePosition", () => {
  it("passes a mid-track position through untouched", () => {
    expect(clampResumePosition(300, 3600)).toBe(300);
  });

  it("treats a zero or negative position as the start", () => {
    expect(clampResumePosition(0, 3600)).toBe(0);
    expect(clampResumePosition(-10, 3600)).toBe(0);
  });

  it("restarts a track sitting within the completion epsilon of its end", () => {
    expect(clampResumePosition(3600, 3600)).toBe(0);
    expect(clampResumePosition(3600 - COMPLETION_EPSILON_SEC, 3600)).toBe(0);
    expect(clampResumePosition(3600 - COMPLETION_EPSILON_SEC - 1, 3600)).toBe(
      3600 - COMPLETION_EPSILON_SEC - 1,
    );
  });

  it("never returns more than the track's length", () => {
    expect(clampResumePosition(5000, 3600)).toBe(0);
    expect(clampResumePosition(3590, 3600)).toBe(3590);
  });

  it("returns the raw position when the duration is unknown", () => {
    expect(clampResumePosition(5000, 0)).toBe(5000);
  });

  it("treats a non-finite position as the start", () => {
    expect(clampResumePosition(Number.NaN, 3600)).toBe(0);
    expect(clampResumePosition(Number.POSITIVE_INFINITY, 3600)).toBe(0);
  });
});
