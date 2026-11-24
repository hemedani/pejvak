import { coreApp } from "../mod.ts";
import { setTokens } from "./setTokens.ts";
import { setUser } from "./setUser.ts";

/**
 * `setTokens` + `setUser`, but **tolerant of an absent token** — and safe against
 * Lesan's process-wide context.
 *
 * Some acts are public to anonymous callers yet must elevate an operator who
 * *does* present a token — one `getChannel`/`listChannels` serving both the
 * signed-out listener and the moderation panel. `setTokens` throws when the
 * header is missing, which is right for a write but wrong for a public read.
 *
 * The subtlety that makes this non-trivial: **Lesan stores its request context in
 * a module-level singleton (`context.ts`), not per-request.** A plain "skip if no
 * token" would therefore leave whatever `user` the *previous* request set, so an
 * anonymous read could inherit an admin identity. On the no-token path we must
 * actively **clear** `user`, not merely omit it.
 *
 * The rule that keeps this safe: **no token → anonymous (cleared); a token that
 * is present but invalid, or an account that is gone → still an error.** We never
 * silently downgrade a caller who tried to authenticate.
 */
export const optionalAuth = async () => {
  try {
    await setTokens();
    await setUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("you should send your token")) {
      // No credential presented: scrub any identity left by a prior request.
      coreApp.contextFns.setContext({ user: undefined });
      return;
    }
    throw error;
  }
};
