import { renderHook, waitFor } from "@testing-library/react-native";

import { useWaitProgress } from "@/hooks/use-wait-progress";
import { WAIT_LONG_MS, WAIT_REVEAL_MS, type PlaybackWait } from "@/lib/playbackPhase";

/**
 * The hook exists so the player can change its words twice without turning
 * into a one-second clock. These cases pin the two moments it wakes up on, and
 * the fact that it says nothing before the first one.
 *
 * Real timers rather than fake ones: the boundaries are wall-clock offsets from
 * a timestamp the *service* wrote, so a fake clock has to be installed before
 * that timestamp exists to mean anything. Waiting the real 400 ms is the honest
 * test, and the 6 s case is the only slow one.
 */
describe("useWaitProgress", () => {
  const connecting = (since = Date.now()): PlaybackWait => ({
    kind: "connecting",
    since,
    stream: true,
  });

  it("stays silent until a wait is long enough to be worth admitting to", async () => {
    // Built outside the render callback, exactly as the store hands it over: a
    // fresh object per render would be a new wait every render, and the hook is
    // right to treat that as "this wait just started".
    const wait = connecting();
    const { result } = await renderHook(() => useWaitProgress(wait));

    expect(result.current).toBe("hidden");

    await waitFor(() => expect(result.current).toBe("early"), {
      timeout: WAIT_REVEAL_MS + 1500,
    });
  });

  it("explains itself once the wait has gone on", async () => {
    const wait = connecting();
    const { result } = await renderHook(() => useWaitProgress(wait));

    await waitFor(() => expect(result.current).toBe("long"), {
      timeout: WAIT_LONG_MS + 2000,
    });
  }, 12000);

  it("says nothing at all when there is nothing to wait for", async () => {
    const { result } = await renderHook(() => useWaitProgress(null));

    expect(result.current).toBe("hidden");
  });

  it("does not carry a previous wait's stage into the next one", async () => {
    const { result, rerender } = await renderHook(
      ({ wait }: { wait: PlaybackWait | null }) => useWaitProgress(wait),
      { initialProps: { wait: connecting() } },
    );

    await waitFor(() => expect(result.current).toBe("early"), {
      timeout: WAIT_REVEAL_MS + 1500,
    });

    await rerender({ wait: connecting() });
    expect(result.current).toBe("hidden");
  });

  it("lands on the right stage for a wait that began before the screen did", async () => {
    // The player can be opened mid-wait — a Continue card starts playback and
    // then navigates — so a boundary already behind us has to fire at once
    // rather than never.
    const wait = connecting(Date.now() - WAIT_LONG_MS);
    const { result } = await renderHook(() => useWaitProgress(wait));

    await waitFor(() => expect(result.current).toBe("long"), { timeout: 1000 });
  });
});
