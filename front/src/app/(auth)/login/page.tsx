import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

/**
 * The signed-out screen.
 *
 * `searchParams` is a Promise in Next 15+ and must be awaited — reading it
 * synchronously compiles and yields `undefined` at runtime, which is the quiet
 * kind of wrong: the form would silently ignore where the listener was going.
 *
 * `redirect` is sanitised to a **same-origin path**. A value like
 * `//evil.example` is a valid URL that a browser will follow off-site, so the
 * only accepted shape is a path that starts with a single `/`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; expired?: string }>;
}) {
  const params = await searchParams;
  const target = sanitizeRedirect(params.redirect);
  const expired = params.expired === "1";

  return (
    <main className="grid min-h-dvh place-items-center px-[var(--space-lg)] py-[var(--space-giant)]">
      <div className="w-full max-w-[420px]">
        <div className="mb-[var(--space-xxl)] flex flex-col items-center gap-[var(--space-sm)] text-center">
          <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-accent-soft text-accent">
            <Icon name="player" size="xl" />
          </span>
          <h1 className="type-title text-text">ورود به پژواک</h1>
          <p className="type-caption text-text-tertiary">
            کنسول شنیدن شما: کتابخانه، تاریخ و آمار.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-outline-variant bg-surface p-[var(--space-xxl)] shadow-[var(--elevation-card)]">
          {expired ? (
            <div
              role="status"
              className="mb-[var(--space-lg)] flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-md)] py-[var(--space-sm)]"
            >
              <Icon name="clock" size="sm" className="mt-[2px] shrink-0 text-text-tertiary" />
              <p className="type-caption text-text-secondary">
                نشست شما منقضی شده بود. دوباره وارد شوید.
              </p>
            </div>
          ) : null}

          <LoginForm redirectTo={target} />
        </div>

        <p className="mt-[var(--space-xl)] text-center type-caption text-text-tertiary">
          حساب ندارید؟ ثبت‌نام در نسخهٔ وب هنوز ممکن نیست؛ از{" "}
          <Link href="/" className="text-accent underline underline-offset-4">
            اپلیکیشن موبایل
          </Link>{" "}
          استفاده کنید.
        </p>
      </div>
    </main>
  );
}

/**
 * Only a single-slash path survives.
 *
 * `//host` and `/\host` are both read by browsers as protocol-relative URLs, so
 * "starts with /" is not enough — the character after it must not be another
 * slash or a backslash.
 */
function sanitizeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }
  const second = value.charAt(1);
  if (second === "/" || second === "\\") {
    return "/";
  }
  return value;
}
