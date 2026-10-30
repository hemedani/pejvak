/**
 * The wall clock, read in exactly one place.
 *
 * ## Why this is a module
 *
 * A Server Component renders once per request, so reading the clock there is not
 * impurity — it is the whole point of a page that says "۲ ساعت پیش". But the
 * React lint rule `react-hooks/purity` cannot tell a Server Component from a
 * Client one: it sees `Date.now()` in a component body and flags it, and it is
 * right to, because the same code in a Client Component would break memoisation
 * and the compiler's assumptions.
 *
 * Rather than suppress the rule three times, the read is named here. That keeps
 * two promises at once:
 *
 *   · **A Server Component may ask what time it is.** `now()` is called once at
 *     the top of a page and passed down; `lib/time.ts` already takes `now` as a
 *     parameter everywhere, so every formatter stays pure and testable.
 *   · **A Client Component may not.** Nothing in `components/` imports this.
 *     A client surface that needs the clock uses `Date.now()` inside an event
 *     handler or a timer, where reading it is an event and not a render.
 *
 * If React Compiler is ever enabled (`next.config.ts`), this file is the list of
 * everything that has to become explicit — which is the other reason it exists.
 */

export function now(): number {
  return Date.now();
}
