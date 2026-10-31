"use client";

/**
 * Applies the listener's starting speed to the player.
 *
 * ## Why this is a client leaf and not part of the shell's read
 *
 * The shell already asks `getMe` once per navigation, and a speed preference is
 * not worth a second act on that critical path. This asks after hydration
 * instead, so the extra read costs nothing on the first paint — and because the
 * leaf lives in the shell layout it mounts once per page load, not once per
 * navigation.
 *
 * ## Two guards, both about not overwriting a decision
 *
 * `setSpeed` is the controller's own entry point, so it does the whole job: the
 * store, the engine's rate, and a session split if one is running. That last part
 * is why the guards exist.
 *
 *   · `current !== null` — a track is already loaded. The listener pressed play
 *     before this answered, and splitting their session to change the rate would
 *     write an artificial boundary into their history.
 *   · `playbackSpeed !== 1` — they have already opened the speed menu. The store
 *     is not persisted, so `1` here means "nothing chosen yet in this page's
 *     lifetime", and anything else is a choice this must not undo.
 *
 * Both are read with `getState()` rather than through the hook: the check and the
 * write have to see the same value, and a value captured at render is a tick old
 * by the time the promise resolves.
 *
 * ## A failed read is silent
 *
 * Falling back is the correct degradation for a preference: the player starts at
 * 1×, which is what a listener who has never opened Settings gets. An error state
 * for a speed nobody asked to change would be a worse outcome than the default.
 */

import { useEffect } from "react";

import { getMySettings } from "@/app/actions/settings/get-my-settings";
import { setSpeed } from "@/lib/player/controller";
import { usePlayerStore } from "@/stores/player";

export function DefaultSpeed() {
  useEffect(() => {
    let cancelled = false;

    void getMySettings().then((result) => {
      if (cancelled || !result.success) {
        return;
      }

      const state = usePlayerStore.getState();
      if (state.current !== null || state.playbackSpeed !== 1) {
        return;
      }

      setSpeed(result.body.defaultSpeed);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
