"use client";

/**
 * The three preferences the backend shares between devices.
 *
 * ## Saved on change, with no Save button
 *
 * A Save button implies a draft, and a draft is something that can be lost by
 * navigating away — which is a worse failure on a settings screen than an extra
 * round trip. Every control writes its own field the moment it changes.
 *
 * That is only safe because `updateMySettings` merges as a **patch**: touching
 * speed cannot overwrite a language chosen on the phone a second earlier, and
 * two controls clicked inside one round trip cannot erase each other.
 *
 * ## Optimistic, with a precise revert
 *
 * The value moves before the request does — a speed control that lags 200 ms
 * behind the click reads as broken. If the write fails, **only the fields that
 * patch touched** go back to the last value the server confirmed. Reverting the
 * whole draft would undo a second change that was still in flight, and the
 * listener would watch a setting they just chose silently undo itself.
 *
 * ## No "Saved" confirmation
 *
 * The control already shows the new value, and once the request settles that
 * value *is* the server's. A toast would be a second copy of the same fact. Only
 * "Saving…" is announced, because a change that looks applied but has not been
 * sent is the one state worth saying out loud.
 */

import { useRef, useState, useTransition } from "react";

import {
  updateMySettings,
  type SettingsPatch,
} from "@/app/actions/settings/update-my-settings";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fieldTrackClass } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { SPEED_OPTIONS, type SharedSettings } from "@/lib/domain/settings";
import { formatSpeed } from "@/lib/format";
import { describeHistoryOrder, HISTORY_SORT_OPTIONS } from "@/lib/history";
import { failureMessage } from "@/lib/messages";

/** A language the listener may choose. Passed in, so the catalogue stays on the server. */
export type LanguageChoice = { code: string; name: string };

/**
 * The speeds to offer, including one that is not on the list.
 *
 * A stored value can be any rate the backend validates (0.5–3), and a rate set
 * from another client must be **visible and selected** rather than leaving the
 * control with nothing highlighted — a segmented control showing no selection
 * looks like a bug and reads as "no preference", which is not what is stored.
 */
function speedChoices(current: number): { value: number; label: string }[] {
  const speeds = SPEED_OPTIONS.includes(current)
    ? [...SPEED_OPTIONS]
    : [...SPEED_OPTIONS, current].sort((a, b) => a - b);

  return speeds.map((speed) => ({ value: speed, label: formatSpeed(speed) }));
}

/** The fields a patch carries, applied to the draft. */
function applyFields(current: SharedSettings, patch: SettingsPatch): SharedSettings {
  return {
    languageCode: patch.languageCode === undefined ? current.languageCode : patch.languageCode,
    defaultSpeed: patch.defaultSpeed ?? current.defaultSpeed,
    historySort: patch.historySort ?? current.historySort,
    updatedAt: current.updatedAt,
  };
}

/** The same fields, taken back from the last value the server confirmed. */
function revertFields(confirmed: SharedSettings, patch: SettingsPatch): SettingsPatch {
  const back: SettingsPatch = {};
  if (patch.languageCode !== undefined) back.languageCode = confirmed.languageCode;
  if (patch.defaultSpeed !== undefined) back.defaultSpeed = confirmed.defaultSpeed;
  if (patch.historySort !== undefined) back.historySort = confirmed.historySort;
  return back;
}

export function SettingsForm({
  settings,
  languages,
}: {
  settings: SharedSettings;
  languages: readonly LanguageChoice[];
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The last value the server confirmed. A ref, not state: nothing renders from
  // it, and a state copy would be a render behind at exactly the moment a
  // failure needs it.
  const confirmed = useRef(settings);

  function save(patch: SettingsPatch) {
    setError(null);
    setDraft((current) => applyFields(current, patch));

    startTransition(async () => {
      const result = await updateMySettings(patch);

      if (!result.success) {
        setDraft((current) => applyFields(current, revertFields(confirmed.current, patch)));
        setError(failureMessage(result.error));
        return;
      }

      confirmed.current = result.body;
      setDraft(result.body);
    });
  }

  const orderNote = describeHistoryOrder(draft.historySort);

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Playback" title="Default speed" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          What a track starts at. You can still change it while listening.
        </p>
        <SegmentedControl
          label="Default playback speed"
          value={draft.defaultSpeed}
          options={speedChoices(draft.defaultSpeed)}
          onChange={(defaultSpeed) => save({ defaultSpeed })}
          disabled={pending}
          className="mt-[var(--space-md)] sm:max-w-[420px]"
        />
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Online" title="Language" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          Browse opens on this language, and a source that serves several falls back to it.
        </p>

        <div className="relative mt-[var(--space-md)] w-full sm:max-w-[320px]">
          <select
            aria-label="Preferred language"
            value={draft.languageCode ?? ""}
            onChange={(event) => save({ languageCode: event.target.value || null })}
            disabled={pending}
            className={cn(
              fieldTrackClass,
              // The native arrow is drawn at a fixed inset that ignores the
              // logical direction; `appearance-none` plus the icon below keeps
              // the chevron on the reading edge.
              "appearance-none pe-[var(--space-xxl)] disabled:opacity-50",
            )}
          >
            {/*
              The empty value is the honest "none": the phone stores null for
              it, and a source with several languages then opens on its own
              primary one rather than on a choice nobody made.
            */}
            <option value="">No preference</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>

          <span className="pointer-events-none absolute inset-y-0 end-[var(--space-lg)] grid place-items-center text-text-tertiary">
            <Icon name="down" size="sm" />
          </span>
        </div>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="History" title="Order" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          The order the History screen reads in.
        </p>

        <SegmentedControl
          label="History order"
          value={draft.historySort}
          options={HISTORY_SORT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(historySort) => save({ historySort })}
          disabled={pending}
          className="mt-[var(--space-md)] sm:max-w-[320px]"
        />

        {/* Said out loud only when the order is not the act's own, because that
            is the case where the list is reordered on this page rather than by
            the query. */}
        {orderNote ? (
          <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">{orderNote}</p>
        ) : null}
      </Card>

      {/*
        One live region for both halves: an empty one is still announced when it
        fills, and a region that is added to the page at the same moment it gets
        its text is often not announced at all.
      */}
      <div aria-live="polite" className="min-h-[20px]">
        {pending ? <p className="type-caption text-text-tertiary">Saving…</p> : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-danger-soft px-[var(--space-md)] py-[var(--space-sm)] text-danger"
        >
          <Icon name="error" size="sm" className="mt-[2px] shrink-0" />
          <p className="type-caption">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
