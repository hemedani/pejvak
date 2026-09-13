import { useCallback, useEffect, useRef, useState } from "react";

import { sleepDeadlineMs } from "@/lib/sleepTimer";
import { pause } from "@/services/TrackPlayerService";

export type SleepTimer = {
  active: boolean;
  remainingMs: number;
  start: (minutes: number) => void;
  cancel: () => void;
};

/**
 * Pauses playback once a wall-clock deadline passes. Ephemeral: it lives only
 * while the player is mounted, and it is a foreground timer (a backgrounded
 * app's JS timers are suspended).
 */
export function useSleepTimer(): SleepTimer {
  const deadlineRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const cancel = useCallback(() => {
    deadlineRef.current = null;
    setActive(false);
    setRemainingMs(0);
  }, []);

  const start = useCallback((minutes: number) => {
    const deadline = sleepDeadlineMs(Date.now(), minutes);
    deadlineRef.current = deadline;
    setActive(true);
    setRemainingMs(deadline - Date.now());
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) {
        return;
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        pause();
        cancel();
        return;
      }
      setRemainingMs(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active, cancel]);

  return { active, remainingMs, start, cancel };
}
