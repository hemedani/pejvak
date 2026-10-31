/**
 * The client-safe face of the online catalogue.
 *
 * Source *metadata* and the pure grouping rules, so a page can render the
 * Browse tab without importing an adapter. The adapters and their registry are
 * server-only and are reached through `registry.ts` or a Server Action, never
 * through this module — importing them from a `"use client"` file must fail.
 */

export * from "@/lib/online/catalogue";
export * from "@/lib/online/languages";
export * from "@/lib/online/series";
export * from "@/lib/online/text";
export * from "@/lib/online/types";
