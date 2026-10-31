import { getMe } from "@/app/actions/auth/get-me";
import { getMySettings } from "@/app/actions/settings/get-my-settings";
import { SettingsForm } from "@/components/domain/settings-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardHeading } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/state";
import { PageHeader } from "@/components/ui/page-header";
import { displayNameOf, initialOf } from "@/lib/domain/user";
import { AVAILABLE_LANGUAGES } from "@/lib/online/languages";

export const metadata = { title: "Settings" };

/**
 * Settings.
 *
 * ## What can be changed here, and what cannot
 *
 * Three preferences are shared with the phone — starting speed, History order,
 * the language Browse opens on — and this page edits all three through
 * `updateMySettings` (box 3.6). A fourth, the theme, belongs to this browser and
 * is a cookie, so it stays a toggle rather than a form field.
 *
 * The profile is still read-only, and still says so. There is no `updateMe` act
 * (plan §2 C3), and a field that looks editable and silently discards the change
 * is worse than a sentence explaining why it cannot be changed.
 *
 * ## A failed settings read replaces the form
 *
 * Not a fallback to defaults. The defaults are real values — 1× speed, newest
 * first, no language — so rendering the form on top of a failed read would let
 * the listener overwrite a preference they never saw, and the first control they
 * touched would silently reset the other two. An error state with a retry is the
 * only version of this screen that cannot lose data.
 *
 * The theme and the profile do not depend on that read, so they still render —
 * the failure is contained in the card that needs it.
 */
export default async function SettingsPage() {
  const [me, settings] = await Promise.all([getMe(), getMySettings()]);

  if (!me.success) {
    return <ErrorState failure={me.error} retryHref="/settings" />;
  }

  const user = me.body;

  return (
    <div className="flex max-w-[820px] flex-col gap-[var(--space-lg)]">
      <PageHeader
        overline="Account"
        title="Settings"
        description="Account details, display preferences, and the choices that follow you to the phone."
      />

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="Signed in as" title="Profile" />

        <div className="mt-[var(--space-lg)] flex items-center gap-[var(--space-md)]">
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft type-heading text-accent">
            {initialOf(user)}
          </span>
          <div className="min-w-0">
            <p className="type-body-strong truncate text-text">{displayNameOf(user)}</p>
            <p className="type-caption truncate text-text-tertiary" dir="ltr">
              {user.email}
            </p>
          </div>
        </div>

        <dl className="mt-[var(--space-lg)] grid gap-[var(--space-md)] sm:grid-cols-2">
          <Field label="Username" value={user.username} ltr />
          <Field label="Email" value={user.email} ltr />
        </dl>

        <p className="type-caption mt-[var(--space-lg)] text-text-tertiary">
          Profiles cannot be edited on the web; the server has no way to change one yet. Use the
          mobile app.
        </p>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="This browser" title="Theme" />
        <div className="mt-[var(--space-md)] flex items-center justify-between gap-[var(--space-md)]">
          <div>
            <p className="type-label text-text">Light or dark</p>
            <p className="type-caption text-text-tertiary">
              On a first visit it follows your system setting.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      {settings.success ? (
        <SettingsForm
          settings={settings.body}
          languages={AVAILABLE_LANGUAGES.map(({ code, name }) => ({ code, name }))}
        />
      ) : (
        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Every device" title="Playback, language and history" />
          <ErrorState failure={settings.error} retryHref="/settings" />
        </Card>
      )}

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="About this version" title="What the web can and cannot do" />
        <ul className="mt-[var(--space-md)] flex flex-col gap-[var(--space-sm)]">
          <Capability ok>See your library, listening history and stats</Capability>
          <Capability ok>Play online collections from their own source</Capability>
          <Capability ok>Take notes at a specific moment</Capability>
          <Capability>Play files on your phone — the audio never reaches the server</Capability>
          <Capability>Download for offline use — the web has no filesystem</Capability>
        </ul>
      </Card>
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-md)] py-[var(--space-sm)]">
      <dt className="type-caption text-text-tertiary">{label}</dt>
      <dd className="type-label mt-[2px] truncate text-text" dir={ltr ? "ltr" : undefined}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Capability({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="type-caption flex items-start gap-[var(--space-sm)]">
      <span
        aria-hidden
        className={`mt-[6px] size-1.5 shrink-0 rounded-full ${ok ? "bg-accent" : "bg-[var(--outline-strong)]"}`}
      />
      <span className={ok ? "text-text-secondary" : "text-text-tertiary"}>{children}</span>
    </li>
  );
}
