import { getMe } from "@/app/actions/auth/get-me";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardHeading } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/state";
import { PageHeader } from "@/components/ui/page-header";
import { displayNameOf, initialOf } from "@/lib/domain/user";

export const metadata = { title: "تنظیمات" };

/**
 * Settings, read-only.
 *
 * There is no `updateMe` act (plan §2 C3), so nothing here edits anything — and
 * a form that looks editable and silently discards the change is worse than a
 * field that says why it cannot be changed. When the act arrives, this page gains
 * its form and nothing else.
 */
export default async function SettingsPage() {
  const result = await getMe();

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/settings" />;
  }

  const user = result.body;

  return (
    <div className="flex max-w-[820px] flex-col gap-[var(--space-lg)]">
      <PageHeader overline="حساب" title="تنظیمات" description="اطلاعات حساب و ترجیحات نمایش." />

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="حساب کاربری" title="مشخصات" />

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
          <Field label="نام کاربری" value={user.username} ltr />
          <Field label="ایمیل" value={user.email} ltr />
        </dl>

        <p className="type-caption mt-[var(--space-lg)] text-text-tertiary">
          ویرایش مشخصات در نسخهٔ وب ممکن نیست؛ سرور فعلاً راهی برای تغییر پروفایل ندارد. از اپلیکیشن
          موبایل استفاده کنید.
        </p>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="نمایش" title="پوسته" />
        <div className="mt-[var(--space-md)] flex items-center justify-between gap-[var(--space-md)]">
          <div>
            <p className="type-label text-text">روشن یا تاریک</p>
            <p className="type-caption text-text-tertiary">
              در اولین بازدید از تنظیمات سیستم شما پیروی می‌کند.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="دربارهٔ این نسخه" title="آنچه وب می‌تواند و نمی‌تواند" />
        <ul className="mt-[var(--space-md)] flex flex-col gap-[var(--space-sm)]">
          <Capability ok>دیدن کتابخانه، تاریخ شنیدن و آمار</Capability>
          <Capability ok>پخش مجموعه‌های آنلاین از منبع خودشان</Capability>
          <Capability ok>یادداشت‌گذاری روی زمان مشخص</Capability>
          <Capability>پخش فایل‌های روی گوشی — صدا هرگز به سرور نمی‌رود</Capability>
          <Capability>دانلود برای حالت آفلاین — وب فایل‌سیستم ندارد</Capability>
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
