import { redirect } from "next/navigation";

import { getMe } from "@/app/actions/auth/get-me";
import { Sidebar } from "@/components/layout/sidebar";
import { PlayerBar } from "@/components/player/player-bar";
import { Topbar } from "@/components/layout/topbar";
import { ErrorState } from "@/components/ui/state";

/**
 * Everything behind the guard.
 *
 * The layout is the guard. Middleware already turns away a request with no
 * cookie at all (see `src/proxy.ts`), but a cookie is not a session — it
 * can be expired, or point at a deleted user — and only the backend can say.
 * So the shell asks `getMe` once per navigation and decides here:
 *
 *   · `unauthorized` → `/login`. `callAct` has already pointed the browser at
 *     the route handler that deletes the cookie, so this redirect lands on a
 *     page with nothing to bounce back from.
 *   · anything else (offline, server) → an error state, **not** a redirect. A
 *     network blip must not look like being signed out; signing the listener out
 *     because the backend was slow is the worst possible response to a timeout.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const result = await getMe();

  if (!result.success) {
    if (result.error.kind === "unauthorized") {
      redirect("/login");
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-[52ch] items-center px-[var(--space-lg)]">
        <ErrorState failure={result.error} className="w-full" />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={result.body} />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-[var(--space-lg)] pb-[calc(var(--space-giant)+76px)] pt-[var(--space-md)] lg:px-[var(--space-xxl)]">
          {children}
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}
