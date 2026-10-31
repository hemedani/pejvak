"use client";

/**
 * Sleep timer.
 *
 * The deadline is wall-clock, so a throttled tab does not stretch the timer.
 * The countdown is displayed, not stored as "minutes left": a clock that only
 * moves when the tab is awake would be a lie about the thing it measures.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { fa } from "@/lib/format";
import { pause } from "@/lib/player/controller";
import {
  SLEEP_TIMER_CHOICES,
  formatRemaining,
  sleepDeadlineMs,
} from "@/lib/player/sleepTimer";

import { Sheet } from "./sheet";

export type SleepTimer = {
  deadline: number | null;
  remainingMs: number;
  expired: boolean;
  start(minutes: number): void;
  cancel(): void;
};

export function useSleepTimer(): SleepTimer {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (deadline === null) {
      return;
    }

    const tick = () => {
      const left = deadline - Date.now();
      if (left <= 0) {
        setDeadline(null);
        setRemainingMs(0);
        setExpired(true);
        pause();
        return;
      }
      setRemainingMs(left);
    };

    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    const onVisibility = () => tick();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deadline]);

  useEffect(() => {
    if (!expired) {
      return;
    }
    const timer = setTimeout(() => setExpired(false), 6000);
    return () => clearTimeout(timer);
  }, [expired]);

  return {
    deadline,
    remainingMs: deadline === null ? 0 : remainingMs,
    expired,
    start: (minutes) => {
      setExpired(false);
      setDeadline(sleepDeadlineMs(Date.now(), minutes));
    },
    cancel: () => {
      setDeadline(null);
      setExpired(false);
    },
  };
}

export function SleepTimerSheet({
  open,
  onOpenChange,
  timer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timer: SleepTimer;
}) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const choose = (minutes: number) => {
    timer.start(minutes);
    onOpenChange(false);
  };

  const chooseCustom = () => {
    const minutes = Number(custom.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
      setError("عددی بین ۱ تا ۱۸۰ دقیقه وارد کنید.");
      return;
    }
    setError(null);
    setCustom("");
    choose(Math.round(minutes));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="تایمر خواب"
      description="پخش در پایان زمان به‌آرامی متوقف می‌شود."
    >
      <div className="flex flex-col gap-[var(--space-lg)]">
        {timer.deadline !== null ? (
          <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-accent-soft px-[var(--space-md)] py-[var(--space-sm)]">
            <p className="type-label flex items-center gap-[var(--space-sm)] text-text">
              <Icon name="sleep" size="md" className="text-accent" />
              <span>باقی‌مانده</span>
              <span className="type-numeric text-accent">{fa(formatRemaining(timer.remainingMs))}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={timer.cancel}>
              لغو تایمر
            </Button>
          </div>
        ) : null}

        <div>
          <p className="type-label mb-[var(--space-sm)] text-text-secondary">یک بازه انتخاب کنید</p>
          <div className="flex flex-wrap gap-[var(--space-sm)]">
            {SLEEP_TIMER_CHOICES.map((minutes) => (
              <Button key={minutes} variant="secondary" size="sm" onClick={() => choose(minutes)}>
                {fa(minutes)} دقیقه
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-[var(--space-sm)]">
          <TextField
            label="بازهٔ دلخواه (دقیقه)"
            inputMode="numeric"
            value={custom}
            error={error ?? undefined}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                chooseCustom();
              }
            }}
          />
          <Button variant="primary" onClick={chooseCustom} disabled={custom.trim() === ""}>
            تنظیم تایمر
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
