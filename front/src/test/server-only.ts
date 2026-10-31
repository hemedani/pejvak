/**
 * The `server-only` package throws when it is imported outside a React Server
 * environment — which is exactly its job in the build. Vitest runs these
 * modules in plain Node to test their pure mapping rules, so the import is
 * aliased to this empty module there.
 *
 * It is not a weakening of the boundary: `next build` still uses the real
 * package, and a `"use client"` file that imports an adapter fails there.
 */
export {};
