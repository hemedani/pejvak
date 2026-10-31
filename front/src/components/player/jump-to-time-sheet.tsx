"use client";

/**
 * Jump to a timecode.
 *
 * `digitsToSeconds` reads the digits right-to-left, the way a timecode is
 * typed: `"1234"` is 12:34. That means the field can be a single plain input
 * with no mask to fight, and a pasted `"12:34"` still works.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatClockFa } from "@/lib/format";
import { seek } from "@/lib/player/controller";
import { clampSeconds, digitsToSeconds } from "@/lib/time";
import { usePlayerStore } from "@/stores/player";

import { Sheet } from "./sheet";

export function JumpToTimeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const durationSec = usePlayerStore((state) => state.durationSec);
  const positionSec = usePlayerStore((state) => state.positionSec);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setValue("");
    setError(null);
  };

  const submit = () => {
    const seconds = digitsToSeconds(value);
    if (seconds === 0 && !/[0۰]/.test(value)) {
      setError("یک زمان وارد کنید؛ مثلاً ۱۲:۳۴.");
      return;
    }
    if (durationSec > 0 && seconds > durationSec) {
      setError(`این قطعه ${formatClockFa(durationSec)} است.`);
      return;
    }
    setError(null);
    seek(clampSeconds(seconds, durationSec > 0 ? durationSec : undefined));
    reset();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      title="پرش به زمان"
      description={
        durationSec > 0
          ? `اکنون ${formatClockFa(positionSec)} از ${formatClockFa(durationSec)}`
          : "برای پرش، زمان را وارد کنید."
      }
    >
      <div className="flex flex-col gap-[var(--space-lg)]">
        <TextField
          label="زمان"
          hint="مثلاً ۱۲:۳۴ یا ۱:۰۲:۳۰"
          inputMode="numeric"
          autoFocus
          value={value}
          error={error ?? undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button variant="primary" onClick={submit} disabled={value.trim() === ""}>
          برو
        </Button>
      </div>
    </Sheet>
  );
}
