"use client";

/**
 * The plan catalogue editor.
 *
 * Prices and limits are rows, not constants, so every field is edited here and
 * sent as data. Limits are a **merge** on the backend: a field left untouched
 * keeps its value, which is why the form sends only the limits the operator
 * changed. `-1` means unlimited; `-2` is refused rather than silently treated as
 * unlimited, so a typo is visible.
 */

import { useState } from "react";

import { adminUpsertPlan } from "@/app/actions/admin/plans/upsert-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { fieldTrackClass } from "@/components/ui/text-field";
import { MutationMessage, useAdminAction } from "@/components/admin/use-admin-action";
import { cn } from "@/lib/cn";
import type { AdminPlan, BillingInterval, PlanLimits } from "@/lib/admin/domain/plans";
import { formatBillingInterval, formatLimit, formatMoney } from "@/lib/admin/format";
import type { UpsertPlanInput } from "@/lib/admin/forms";
import { formatNumber } from "@/lib/format";

type PlanDraft = {
  code: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  billingInterval: BillingInterval;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: string;
  limits: {
    historyEntries: string;
    crossDeviceSync: boolean;
    playlists: string;
    maxTracks: string;
    aiCreditsPerMonth: string;
  };
  features: string;
};

export function PlanEditor({
  plans,
  canMutate,
}: {
  plans: AdminPlan[];
  canMutate: boolean;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {canMutate ? (
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-sm)]">
          <p className="type-caption text-text-tertiary">
            {plans.length} {plans.length === 1 ? "plan" : "plans"} in the catalogue.
          </p>
          <Button type="button" variant="primary" size="md" onClick={() => setCreating((open) => !open)}>
            <Icon name={creating ? "close" : "plus"} size="sm" />
            {creating ? "Close new plan" : "New plan"}
          </Button>
        </div>
      ) : null}

      {canMutate && creating ? (
        <PlanForm plan={null} onDone={() => setCreating(false)} />
      ) : null}

      {plans.length === 0 ? (
        <Card className="p-[var(--space-xl)]">
          <p className="type-body text-text">The catalogue is empty.</p>
          <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
            A listener with no subscription falls back to the plan marked as default. Create
            at least one before opening signups.
          </p>
        </Card>
      ) : (
        plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} canMutate={canMutate} />
        ))
      )}
    </div>
  );
}

function PlanCard({ plan, canMutate }: { plan: AdminPlan; canMutate: boolean }) {
  if (!canMutate) {
    return (
      <Card className="p-[var(--space-xl)]">
        <PlanSummary plan={plan} />
      </Card>
    );
  }

  return (
    <Card className="p-[var(--space-xl)]">
      <PlanSummary plan={plan} />
      <details className="mt-[var(--space-lg)] border-t border-outline-variant pt-[var(--space-md)]">
        <summary className="type-label cursor-pointer select-none text-text-secondary">Edit plan</summary>
        <div className="mt-[var(--space-md)]">
          <PlanForm plan={plan} />
        </div>
      </details>
    </Card>
  );
}

function PlanSummary({ plan }: { plan: AdminPlan }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-[var(--space-md)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-[var(--space-sm)]">
          <h2 className="type-heading text-text">{plan.title}</h2>
          <Badge tone="neutral">{plan.code}</Badge>
          {!plan.isActive ? <Badge tone="muted">Archived</Badge> : null}
          {plan.isDefault ? <Badge tone="accent">Default</Badge> : null}
        </div>
        {plan.description ? (
          <p className="type-caption mt-[var(--space-xs)] max-w-[70ch] text-text-tertiary">
            {plan.description}
          </p>
        ) : null}
      </div>

      <div className="text-end">
        <p className="type-heading text-text">
          {plan.priceCents === 0 ? "Free" : formatMoney(plan.priceCents, plan.currency)}
        </p>
        <p className="type-caption text-text-tertiary">{formatBillingInterval(plan.billingInterval)}</p>
        <p className="type-caption text-text-tertiary">{formatNumber(plan.subscribers)} active subscribers</p>
      </div>
    </div>
  );
}

function PlanForm({ plan, onDone }: { plan: AdminPlan | null; onDone?: () => void }) {
  const { pending, error, message, run } = useAdminAction();
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromPlan(plan));

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const priceCents = Math.round(Number(draft.price || "0") * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return;
    }

    const limits: Partial<PlanLimits> = {
      historyEntries: toLimit(draft.limits.historyEntries),
      crossDeviceSync: draft.limits.crossDeviceSync,
      playlists: toLimit(draft.limits.playlists),
      maxTracks: toLimit(draft.limits.maxTracks),
      aiCreditsPerMonth: toLimit(draft.limits.aiCreditsPerMonth),
    };

    const input: UpsertPlanInput = {
      code: draft.code.trim(),
      title: draft.title.trim(),
      description: draft.description,
      priceCents,
      currency: draft.currency.trim() || "USD",
      billingInterval: draft.billingInterval,
      isActive: draft.isActive,
      isDefault: draft.isDefault,
      sortOrder: Number(draft.sortOrder || "0"),
      limits,
      features: draft.features
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    };

    run(() => adminUpsertPlan(input), (saved) => {
      setDraft(draftFromPlan(saved));
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-[var(--space-md)] sm:grid-cols-2">
      <Field label="Code">
        <input
          value={draft.code}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          disabled={pending || plan !== null}
          placeholder="pro"
          className={cn(fieldTrackClass, "disabled:opacity-60")}
        />
      </Field>
      <Field label="Title">
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          disabled={pending}
          className={fieldTrackClass}
        />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          disabled={pending}
          rows={2}
          className={cn(fieldTrackClass, "h-auto py-[var(--space-sm)]")}
        />
      </Field>
      <Field label="Price">
        <input
          inputMode="decimal"
          value={draft.price}
          onChange={(event) => setDraft({ ...draft, price: event.target.value })}
          disabled={pending}
          placeholder="3.99"
          className={fieldTrackClass}
        />
      </Field>
      <Field label="Currency">
        <input
          value={draft.currency}
          onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })}
          disabled={pending}
          placeholder="USD"
          className={fieldTrackClass}
        />
      </Field>
      <Field label="Billing interval">
        <select
          value={draft.billingInterval}
          onChange={(event) => setDraft({ ...draft, billingInterval: event.target.value as BillingInterval })}
          disabled={pending}
          className={fieldTrackClass}
        >
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
          <option value="lifetime">Lifetime</option>
        </select>
      </Field>
      <Field label="Sort order">
        <input
          type="number"
          value={draft.sortOrder}
          onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
          disabled={pending}
          className={fieldTrackClass}
        />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="type-label mb-[var(--space-sm)] text-text">Limits</legend>
        <div className="grid gap-[var(--space-md)] sm:grid-cols-2 lg:grid-cols-4">
          <LimitField
            label="History entries"
            value={draft.limits.historyEntries}
            onChange={(value) => setDraft({ ...draft, limits: { ...draft.limits, historyEntries: value } })}
            disabled={pending}
          />
          <LimitField
            label="Playlists"
            value={draft.limits.playlists}
            onChange={(value) => setDraft({ ...draft, limits: { ...draft.limits, playlists: value } })}
            disabled={pending}
          />
          <LimitField
            label="Max tracks"
            value={draft.limits.maxTracks}
            onChange={(value) => setDraft({ ...draft, limits: { ...draft.limits, maxTracks: value } })}
            disabled={pending}
          />
          <LimitField
            label="AI credits / month"
            value={draft.limits.aiCreditsPerMonth}
            onChange={(value) => setDraft({ ...draft, limits: { ...draft.limits, aiCreditsPerMonth: value } })}
            disabled={pending}
          />
        </div>
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          -1 means unlimited. Any other negative value is refused.
        </p>

        <label className="mt-[var(--space-md)] flex items-center gap-[var(--space-sm)] type-label text-text">
          <input
            type="checkbox"
            checked={draft.limits.crossDeviceSync}
            onChange={(event) =>
              setDraft({
                ...draft,
                limits: { ...draft.limits, crossDeviceSync: event.target.checked },
              })}
            disabled={pending}
          />
          Cross-device sync
        </label>
      </fieldset>

      <Field label="Features (one per line)" className="sm:col-span-2">
        <textarea
          value={draft.features}
          onChange={(event) => setDraft({ ...draft, features: event.target.value })}
          disabled={pending}
          rows={3}
          className={cn(fieldTrackClass, "h-auto py-[var(--space-sm)]")}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-[var(--space-lg)] sm:col-span-2">
        <label className="flex items-center gap-[var(--space-sm)] type-label text-text">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            disabled={pending}
          />
          Active
        </label>
        <label className="flex items-center gap-[var(--space-sm)] type-label text-text">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
            disabled={pending}
          />
          Default plan
        </label>
      </div>

      <MutationMessage error={error} message={message ?? (plan === null ? null : "Saved.")} />

      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" size="md" disabled={pending || draft.code.trim() === ""}>
          {plan === null ? "Create plan" : "Save plan"}
        </Button>
      </div>
    </form>
  );
}

function LimitField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-[var(--space-xs)]">
      <span className="type-caption text-text-secondary">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={fieldTrackClass}
      />
    </label>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-[var(--space-xs)]", className)}>
      <span className="type-label text-text">{label}</span>
      {children}
    </label>
  );
}

function draftFromPlan(plan: AdminPlan | null): PlanDraft {
  if (!plan) {
    return {
      code: "",
      title: "",
      description: "",
      price: "0",
      currency: "USD",
      billingInterval: "month",
      isActive: true,
      isDefault: false,
      sortOrder: "0",
      limits: {
        historyEntries: "500",
        crossDeviceSync: true,
        playlists: "10",
        maxTracks: "-1",
        aiCreditsPerMonth: "0",
      },
      features: "",
    };
  }

  return {
    code: plan.code,
    title: plan.title,
    description: plan.description ?? "",
    price: (plan.priceCents / 100).toFixed(2),
    currency: plan.currency,
    billingInterval: plan.billingInterval,
    isActive: plan.isActive,
    isDefault: plan.isDefault,
    sortOrder: String(plan.sortOrder),
    limits: {
      historyEntries: String(plan.limits.historyEntries),
      crossDeviceSync: plan.limits.crossDeviceSync,
      playlists: String(plan.limits.playlists),
      maxTracks: String(plan.limits.maxTracks),
      aiCreditsPerMonth: String(plan.limits.aiCreditsPerMonth),
    },
    features: plan.features.join("\n"),
  };
}

function toLimit(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}
