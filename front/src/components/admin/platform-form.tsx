"use client";

/**
 * The four global switches.
 *
 * Nothing else belongs on this page: prices and limits are plan rows because
 * they are sold. An announcement is cleared by submitting an empty string, which
 * the backend normalises to `null` on the next read.
 */

import { useState } from "react";

import { adminUpdatePlatformSetting } from "@/app/actions/admin/platform/update-platform-setting";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { fieldTrackClass } from "@/components/ui/text-field";
import { MutationMessage, useAdminAction } from "@/components/admin/use-admin-action";
import type { PlatformSetting } from "@/lib/admin/domain/platform";

export function PlatformForm({
  setting,
  canMutate,
}: {
  setting: PlatformSetting;
  canMutate: boolean;
}) {
  const { pending, error, message, run } = useAdminAction();
  const [draft, setDraft] = useState({
    signupsEnabled: setting.signupsEnabled,
    aiEnabled: setting.aiEnabled,
    maintenanceMode: setting.maintenanceMode,
    announcement: setting.announcement ?? "",
  });

  if (!canMutate) {
    return (
      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Read-only" title="Platform switches" />
        <dl className="mt-[var(--space-lg)] grid gap-[var(--space-md)] sm:grid-cols-2">
          <Fact label="Signups" value={setting.signupsEnabled ? "Enabled" : "Closed"} />
          <Fact label="AI" value={setting.aiEnabled ? "Enabled" : "Disabled"} />
          <Fact label="Maintenance" value={setting.maintenanceMode ? "On" : "Off"} />
          <Fact label="Announcement" value={setting.announcement ?? "None"} />
        </dl>
        <p className="type-caption mt-[var(--space-md)] text-text-tertiary">
          Support may read these switches. Flipping them requires an admin account.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-[var(--space-xl)]">
      <CardHeading overline="Global" title="Platform switches" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              adminUpdatePlatformSetting({
                signupsEnabled: draft.signupsEnabled,
                aiEnabled: draft.aiEnabled,
                maintenanceMode: draft.maintenanceMode,
                announcement: draft.announcement,
              }),
            () => undefined,
          );
        }}
        className="mt-[var(--space-lg)] flex flex-col gap-[var(--space-lg)]"
      >
        <div className="flex flex-col gap-[var(--space-md)]">
          <Toggle
            label="Signups enabled"
            hint="Closing signups does not sign anyone out. Existing sessions keep working."
            checked={draft.signupsEnabled}
            onChange={(signupsEnabled) => setDraft({ ...draft, signupsEnabled })}
            disabled={pending}
          />
          <Toggle
            label="AI enabled"
            hint="The credit meter is already recorded; this switch is the product-level pause."
            checked={draft.aiEnabled}
            onChange={(aiEnabled) => setDraft({ ...draft, aiEnabled })}
            disabled={pending}
          />
          <Toggle
            label="Maintenance mode"
            hint="A client signal. This panel keeps working during maintenance."
            checked={draft.maintenanceMode}
            onChange={(maintenanceMode) => setDraft({ ...draft, maintenanceMode })}
            disabled={pending}
          />
        </div>

        <label className="flex flex-col gap-[var(--space-xs)]">
          <span className="type-label text-text">Announcement</span>
          <textarea
            value={draft.announcement}
            onChange={(event) => setDraft({ ...draft, announcement: event.target.value })}
            disabled={pending}
            rows={3}
            placeholder="Shown to clients when set. Leave empty to clear."
            className={`${fieldTrackClass} h-auto py-[var(--space-sm)]`}
          />
          <span className="type-caption text-text-tertiary">
            An empty announcement is stored as none.
          </span>
        </label>

        <MutationMessage error={error} message={message ?? null} />

        <div>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            Save switches
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-[var(--space-sm)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-[3px]"
      />
      <span>
        <span className="type-label block text-text">{label}</span>
        <span className="type-caption block text-text-tertiary">{hint}</span>
      </span>
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-overline text-text-tertiary">{label}</dt>
      <dd className="type-caption mt-[2px] text-text">{value}</dd>
    </div>
  );
}
