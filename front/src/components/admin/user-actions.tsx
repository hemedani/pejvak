"use client";

/**
 * Every mutation on one account, in one place.
 *
 * Each form awaits the server and refreshes the server component — no optimistic
 * state. The destructive ones take a typed value the backend also checks (the
 * account email for delete, the plan code for revoke), so the confirmation is
 * not a checkbox that a stray click can satisfy.
 *
 * Support never receives this component with `canMutate: true`; the page decides,
 * and every action still checks the role on the server.
 */

import Link from "next/link";
import { useState } from "react";

import { adminGrantAiCredits } from "@/app/actions/admin/ai/grant-ai-credits";
import { adminDeleteUser, type DeleteUserResult } from "@/app/actions/admin/users/delete-user";
import { adminResetUserPassword } from "@/app/actions/admin/users/reset-user-password";
import { adminUpdateUser } from "@/app/actions/admin/users/update-user";
import { adminGrantSubscription } from "@/app/actions/admin/subscriptions/grant-subscription";
import { adminRevokeSubscription } from "@/app/actions/admin/subscriptions/revoke-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { fieldTrackClass } from "@/components/ui/text-field";
import { MutationMessage, useAdminAction } from "@/components/admin/use-admin-action";
import { cn } from "@/lib/cn";
import { currentPeriodKey } from "@/lib/admin/domain/ai";
import type { AdminPlan } from "@/lib/admin/domain/plans";
import type { Entitlement } from "@/lib/admin/domain/users";
import type { AdminUser } from "@/lib/admin/domain/users";
import type {
  GrantDurationUnit,
  GrantMode,
} from "@/lib/admin/domain/subscriptions";
import { formatMoney } from "@/lib/admin/format";
import type { GrantSubscriptionInput } from "@/lib/admin/forms";

type GrantChoice = "interval" | GrantMode;

export function UserActions({
  user,
  entitlement,
  plans,
  currentUserId,
  canMutate,
}: {
  user: AdminUser;
  entitlement: Entitlement | null;
  plans: AdminPlan[];
  currentUserId: string;
  canMutate: boolean;
}) {
  const { pending, error, message, setError, setMessage, run } = useAdminAction();

  const [identity, setIdentity] = useState({
    username: user.username,
    email: user.email,
    displayName: user.displayName ?? "",
  });
  const [role, setRole] = useState(user.role);
  const [suspendReason, setSuspendReason] = useState(user.suspendedReason ?? "");

  const activePlans = plans.filter((plan) => plan.isActive);
  const [planCode, setPlanCode] = useState(activePlans[0]?.code ?? plans[0]?.code ?? "");
  const [grantChoice, setGrantChoice] = useState<GrantChoice>("interval");
  const [durationValue, setDurationValue] = useState("1");
  const [durationUnit, setDurationUnit] = useState<GrantDurationUnit>("month");
  const [caps, setCaps] = useState({ historyEntries: "", playlists: "", maxTracks: "" });
  const [note, setNote] = useState("");

  const [revokeConfirm, setRevokeConfirm] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleted, setDeleted] = useState<DeleteUserResult | null>(null);

  const [credits, setCredits] = useState("10");
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [creditNote, setCreditNote] = useState("");

  const isSelf = user.id === currentUserId;
  const currentPlanCode = entitlement?.planCode ?? user.planCode ?? "";

  if (!canMutate) {
    return (
      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Read-only" title="Support access" />
        <p className="type-caption mt-[var(--space-xs)] max-w-[60ch] text-text-tertiary">
          Support operators can read every page and every account. Changes require an
          admin account, and the backend refuses a support token even if a control is
          made visible.
        </p>
      </Card>
    );
  }

  function submitIdentity(event: React.FormEvent) {
    event.preventDefault();
    run(() =>
      adminUpdateUser({
        userId: user.id,
        username: identity.username,
        email: identity.email.trim(),
        displayName: identity.displayName,
      }),
      () => setMessage("Identity updated."),
    );
  }

  function submitRole(event: React.FormEvent) {
    event.preventDefault();
    run(() => adminUpdateUser({ userId: user.id, role }), () => setMessage("Role updated."));
  }

  function suspend(event: React.FormEvent) {
    event.preventDefault();
    run(
      () =>
        adminUpdateUser({
          userId: user.id,
          status: "suspended",
          suspendedReason: suspendReason.trim() || "Suspended by an admin",
        }),
      () => setMessage("Account suspended."),
    );
  }

  function reactivate() {
    run(() => adminUpdateUser({ userId: user.id, status: "active" }), () =>
      setMessage("Account reactivated."),
    );
  }

  function submitGrant(event: React.FormEvent) {
    event.preventDefault();

    const capsInput = grantChoice === "usage"
      ? {
        historyEntries: caps.historyEntries === "" ? undefined : Number(caps.historyEntries),
        playlists: caps.playlists === "" ? undefined : Number(caps.playlists),
        maxTracks: caps.maxTracks === "" ? undefined : Number(caps.maxTracks),
      }
      : undefined;

    if (grantChoice === "usage" && capsInput !== undefined && Object.values(capsInput).every((value) => value === undefined)) {
      setError("A usage grant needs at least one cap.");
      return;
    }

    const value = Number(durationValue);
    if (grantChoice === "duration" && (!Number.isInteger(value) || value <= 0)) {
      setError("A duration grant needs a positive whole number.");
      return;
    }

    const input: GrantSubscriptionInput = {
      userId: user.id,
      planCode,
      ...(grantChoice === "interval"
        ? { interval: plans.find((plan) => plan.code === planCode)?.billingInterval }
        : { mode: grantChoice }),
      ...(grantChoice === "duration"
        ? { duration: { value, unit: durationUnit } }
        : {}),
      ...(grantChoice === "usage" && capsInput !== undefined ? { caps: capsInput } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    run(() => adminGrantSubscription(input), (grant) => {
      setMessage(
        `Granted ${grant.planTitle ?? grant.planCode ?? planCode}. Reference: ${grant.reference ?? "—"}.`,
      );
      setNote("");
    });
  }

  function submitRevoke(event: React.FormEvent) {
    event.preventDefault();

    if (revokeConfirm.trim().toLowerCase() !== currentPlanCode.toLowerCase()) {
      setError(`Type ${currentPlanCode} to confirm.`);
      return;
    }

    run(
      () =>
        adminRevokeSubscription({
          userId: user.id,
          ...(revokeReason.trim() ? { reason: revokeReason.trim() } : {}),
        }),
      (result) => {
        setMessage(
          `Access ends now. The account is on ${result.planCode ?? "the free plan"} (${result.status ?? "canceled"}).`,
        );
        setRevokeConfirm("");
        setRevokeReason("");
      },
    );
  }

  function reset() {
    setResetPassword(null);
    setCopied(false);
    run(
      () => adminResetUserPassword({ userId: user.id }),
      (result) => {
        setResetPassword(result.password);
        setMessage("Password reset. It is shown once below.");
      },
    );
  }

  async function copyPassword() {
    if (!resetPassword) return;
    try {
      await navigator.clipboard.writeText(resetPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function submitDelete(event: React.FormEvent) {
    event.preventDefault();
    run(
      () =>
        adminDeleteUser({
          userId: user.id,
          confirmEmail: deleteConfirm.trim(),
        }),
      (result) => setDeleted(result),
      { refresh: false },
    );
  }

  function submitCredits(event: React.FormEvent) {
    event.preventDefault();
    run(
      () =>
        adminGrantAiCredits({
          userId: user.id,
          credits: Number(credits),
          ...(periodKey.trim() ? { periodKey: periodKey.trim() } : {}),
          ...(creditNote.trim() ? { note: creditNote.trim() } : {}),
        }),
      (grant) => {
        setMessage(
          `Granted ${grant.granted} credits for ${grant.periodKey}. Bonus pool: ${grant.bonusCredits}; used: ${grant.creditsUsed}.`,
        );
        setCreditNote("");
      },
    );
  }

  if (deleted !== null) {
    return (
      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Deleted" title="Account removed" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          Billing transactions survive — they are financial records, not child rows.
        </p>
        <ul className="mt-[var(--space-md)] grid grid-cols-2 gap-[var(--space-sm)] sm:grid-cols-4">
          {Object.entries(deleted.purged).map(([collection, count]) => (
            <li key={collection} className="rounded-[var(--radius-sm)] bg-surface-sunken p-[var(--space-sm)]">
              <p className="type-caption text-text-tertiary">{collection}</p>
              <p className="type-numeric text-text">{count}</p>
            </li>
          ))}
        </ul>
        <Button asChild variant="primary" size="md" className="mt-[var(--space-lg)]">
          <Link href="/admin/users">Back to users</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <MutationMessage error={error} message={message} />

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Identity" title="Account fields" />
        <form onSubmit={submitIdentity} className="mt-[var(--space-md)] grid gap-[var(--space-md)] sm:grid-cols-2">
          <Field label="Username">
            <input
              value={identity.username}
              onChange={(event) => setIdentity({ ...identity, username: event.target.value })}
              className={fieldTrackClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={identity.email}
              onChange={(event) => setIdentity({ ...identity, email: event.target.value })}
              className={fieldTrackClass}
            />
          </Field>
          <Field label="Display name" className="sm:col-span-2">
            <input
              value={identity.displayName}
              onChange={(event) => setIdentity({ ...identity, displayName: event.target.value })}
              className={fieldTrackClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" size="md" disabled={pending}>
              Save identity
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Access" title="Role and status" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          {isSelf
            ? "You cannot change your own role or status. Another admin must do it."
            : "The backend also refuses removing the last active admin."}
        </p>

        <form onSubmit={submitRole} className="mt-[var(--space-md)] flex flex-wrap items-end gap-[var(--space-sm)]">
          <Field label="Role">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
              disabled={isSelf || pending}
              className={cn(fieldTrackClass, "min-w-[180px]")}
            >
              <option value="user">Listener</option>
              <option value="support">Support</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Button type="submit" variant="secondary" size="md" disabled={isSelf || pending}>
            Update role
          </Button>
        </form>

        <div className="mt-[var(--space-lg)] border-t border-outline-variant pt-[var(--space-lg)]">
          {user.status === "suspended" ? (
            <div className="flex flex-wrap items-end gap-[var(--space-sm)]">
              <p className="type-caption text-text-secondary">
                Suspended {user.suspendedAt ? "— reason" : ""}: {user.suspendedReason ?? "no reason recorded"}
              </p>
              <Button type="button" variant="secondary" size="md" disabled={isSelf || pending} onClick={reactivate}>
                Reactivate
              </Button>
            </div>
          ) : (
            <form onSubmit={suspend} className="flex flex-wrap items-end gap-[var(--space-sm)]">
              <Field label="Suspension reason" className="min-w-[260px] flex-1">
                <input
                  value={suspendReason}
                  onChange={(event) => setSuspendReason(event.target.value)}
                  placeholder="Why is this account read-only?"
                  disabled={isSelf || pending}
                  className={fieldTrackClass}
                />
              </Field>
              <Button type="submit" variant="danger" size="md" disabled={isSelf || pending}>
                Suspend
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Entitlement" title="Grant a plan" />
        <form onSubmit={submitGrant} className="mt-[var(--space-md)] grid gap-[var(--space-md)] sm:grid-cols-2">
          <Field label="Plan">
            <select
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            >
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.title} ({plan.code}){plan.isActive ? "" : " — archived"} ·{" "}
                  {flexiblePrice(plan)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Mode">
            <select
              value={grantChoice}
              onChange={(event) => setGrantChoice(event.target.value as GrantChoice)}
              disabled={pending}
              className={fieldTrackClass}
            >
              <option value="interval">One plan interval</option>
              <option value="forever">Forever</option>
              <option value="duration">Fixed duration</option>
              <option value="usage">Usage caps</option>
            </select>
          </Field>

          {grantChoice === "duration" ? (
            <>
              <Field label="Duration value">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={durationValue}
                  onChange={(event) => setDurationValue(event.target.value)}
                  disabled={pending}
                  className={fieldTrackClass}
                />
              </Field>
              <Field label="Unit">
                <select
                  value={durationUnit}
                  onChange={(event) => setDurationUnit(event.target.value as GrantDurationUnit)}
                  disabled={pending}
                  className={fieldTrackClass}
                >
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
                  <option value="year">Years</option>
                </select>
              </Field>
            </>
          ) : null}

          {grantChoice === "usage" ? (
            <>
              <Field label="History entries cap">
                <input
                  inputMode="numeric"
                  value={caps.historyEntries}
                  onChange={(event) => setCaps({ ...caps, historyEntries: event.target.value })}
                  placeholder="e.g. 500"
                  disabled={pending}
                  className={fieldTrackClass}
                />
              </Field>
              <Field label="Playlists cap">
                <input
                  inputMode="numeric"
                  value={caps.playlists}
                  onChange={(event) => setCaps({ ...caps, playlists: event.target.value })}
                  placeholder="e.g. 10"
                  disabled={pending}
                  className={fieldTrackClass}
                />
              </Field>
              <Field label="Tracks cap">
                <input
                  inputMode="numeric"
                  value={caps.maxTracks}
                  onChange={(event) => setCaps({ ...caps, maxTracks: event.target.value })}
                  placeholder="e.g. 1000"
                  disabled={pending}
                  className={fieldTrackClass}
                />
              </Field>
              <p className="type-caption text-text-tertiary sm:col-span-2">
                A usage cap is an absolute stock threshold. Reaching any one cap expires the
                whole grant and falls back to free, keeping the data.
              </p>
            </>
          ) : null}

          <Field label="Note" className="sm:col-span-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this grant was made"
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" size="md" disabled={pending || !planCode}>
              Grant plan
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Destructive" title="Revoke access" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          Access ends now, not at the end of the paid period. The row is kept, so the
          audit trail still explains what happened.
        </p>
        <form onSubmit={submitRevoke} className="mt-[var(--space-md)] grid gap-[var(--space-md)] sm:grid-cols-2">
          <Field label={`Type ${currentPlanCode || "the current plan code"} to confirm`}>
            <input
              value={revokeConfirm}
              onChange={(event) => setRevokeConfirm(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <Field label="Reason (optional)">
            <input
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="danger" size="md" disabled={pending || !currentPlanCode}>
              Revoke now
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Support" title="Reset password" />
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          The generated password is returned once. It is not written to the audit log
          and cannot be read again after you leave this page.
        </p>

        <Button type="button" variant="secondary" size="md" className="mt-[var(--space-md)]" disabled={pending} onClick={reset}>
          Generate new password
        </Button>

        {resetPassword ? (
          <div className="mt-[var(--space-md)] flex flex-wrap items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] border border-outline-strong bg-surface-sunken p-[var(--space-md)]">
            <code className="type-numeric min-w-0 flex-1 break-all text-text" dir="ltr">
              {resetPassword}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={copyPassword}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}
        {resetPassword ? (
          <p className="type-caption mt-[var(--space-xs)] text-danger">This will not be shown again.</p>
        ) : null}
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="AI" title="Grant credits" />
        <form onSubmit={submitCredits} className="mt-[var(--space-md)] grid gap-[var(--space-md)] sm:grid-cols-3">
          <Field label="Credits">
            <input
              type="number"
              min={1}
              step={1}
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <Field label="Period (YYYY-MM)">
            <input
              value={periodKey}
              onChange={(event) => setPeriodKey(event.target.value)}
              placeholder="2026-11"
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <Field label="Note">
            <input
              value={creditNote}
              onChange={(event) => setCreditNote(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" size="md" disabled={pending}>
              Add credits
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-danger/30 p-[var(--space-xl)]">
        <CardHeading overline="Irreversible" title="Delete account" />
        <p className="type-caption mt-[var(--space-xs)] max-w-[60ch] text-text-tertiary">
          Children go first and the account last. Billing transactions survive. Type the
          account&apos;s email to confirm.
        </p>
        <form onSubmit={submitDelete} className="mt-[var(--space-md)] flex flex-wrap items-end gap-[var(--space-sm)]">
          <Field label={`Type ${user.email} to confirm`} className="min-w-[260px] flex-1">
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              disabled={pending}
              className={fieldTrackClass}
            />
          </Field>
          <Button
            type="submit"
            variant="danger"
            size="md"
            disabled={pending || deleteConfirm.trim().toLowerCase() !== user.email.toLowerCase()}
          >
            <Icon name="delete" size="sm" />
            Delete account
          </Button>
        </form>
      </Card>
    </div>
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

function flexiblePrice(plan: AdminPlan): string {
  if (plan.priceCents === 0) return "Free";
  return formatMoney(plan.priceCents, plan.currency);
}
