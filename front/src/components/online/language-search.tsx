"use client";

/**
 * The language catalogue, filterable as you type.
 *
 * Everything here is local: the catalogue is a static table of 47 rows that is
 * already in the payload, so filtering it is arithmetic on an array, not a
 * request. That is why there is **no debounce timer and no spinner** — a
 * `setTimeout` over 47 rows would add latency to a computation that has already
 * finished, and a spinner would report work that is not happening.
 *
 * `useDeferredValue` rather than `useState` alone, because the field must stay
 * responsive while the list re-renders: the input is controlled by the immediate
 * value and the list reads the deferred one, so a fast typist never sees a
 * keystroke swallowed by the list's render.
 *
 * The comparison is **folded** (`lib/search.ts`): «فارسی», «Persian» and «fa»
 * all find Persian, and an Arabic kaf finds the Persian one. A raw `includes()`
 * would find exactly one spelling of each, which in Persian means finding
 * almost none of them.
 *
 * The index is built once per catalogue, not per keystroke — folding 47 rows
 * across four fields on every character is the difference between a search field
 * and a search field that stutters.
 */

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { LanguageList } from "@/components/online/language-list";
import { Icon } from "@/components/ui/icon";
import { languageSearchFields } from "@/lib/online/catalogue";
import type { OnlineLanguage } from "@/lib/online/types";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";

export function LanguageSearch({
  languages,
  preferred = null,
}: {
  languages: readonly OnlineLanguage[];
  /**
   * The listener's chosen language (`settings.languageCode`), or null.
   *
   * Offered as a shortcut **above** the catalogue rather than by moving its row
   * to the top. The catalogue's order is English-name ascending on purpose (see
   * `language-list.tsx`): it is the one order that is the same on every device,
   * which is what makes the list learnable. Reordering it per listener would
   * trade that for a convenience the shortcut already provides.
   *
   * Only a language that is actually browsable gets the shortcut. A stored code
   * whose source has since been removed must quietly stop being offered, not
   * become a link to an empty shelf — and not an error, either.
   */
  preferred?: string | null;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const index = useMemo(
    () => createSearchIndex(languages, languageSearchFields, "title"),
    [languages],
  );

  const hits = useMemo(() => {
    const terms = foldQuery(deferred);
    // `null` means "no query" — which is a different state from "a query that
    // matched nothing", and the two draw different things.
    if (terms.length === 0) {
      return null;
    }
    return searchIndex(index, terms).map((hit) => hit.item);
  }, [index, deferred]);

  const visible = hits ?? languages;

  const shortcut = useMemo(
    () => languages.find((language) => language.code === preferred && language.available) ?? null,
    [languages, preferred],
  );

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      {shortcut ? (
        <Link
          href={`/browse/language/${shortcut.code}`}
          className="flex items-center gap-[var(--space-md)] rounded-[var(--radius-card)] border border-outline-variant bg-surface px-[var(--space-lg)] py-[var(--space-md)] shadow-[var(--elevation-card)] transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
        >
          <div className="min-w-0 flex-1">
            <p className="type-overline text-text-tertiary">Your language</p>
            <p className="type-label mt-[var(--space-xs)] truncate text-text" dir={shortcut.direction}>
              {shortcut.nativeName}
            </p>
          </div>
          <Icon name="end" size="sm" className="shrink-0 text-text-tertiary" />
        </Link>
      ) : null}

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-[var(--space-md)] grid place-items-center text-text-tertiary">
          <Icon name="search" size="sm" />
        </span>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search languages…"
          aria-label="Search languages"
          className="h-11 w-full rounded-[var(--radius-pill)] border border-outline-strong bg-surface-sunken pe-[var(--space-lg)] ps-10 type-body text-text placeholder:text-text-tertiary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />

        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute inset-y-0 end-[var(--space-sm)] grid place-items-center px-[var(--space-sm)] text-text-tertiary hover:text-text"
          >
            <Icon name="close" size="sm" />
          </button>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
        {visible.length > 0 ? (
          <LanguageList languages={visible} />
        ) : (
          <p className="type-caption px-[var(--space-lg)] py-[var(--space-xxl)] text-center text-text-tertiary">
            No language matched that name.
          </p>
        )}
      </div>

      {hits !== null && hits.length > 0 ? (
        // Said out loud, because a shortened list with no explanation reads as a
        // catalogue that only has six languages.
        <p className="type-caption text-text-tertiary" aria-live="polite">
          {`${hits.length} of ${languages.length} languages`}
        </p>
      ) : null}
    </div>
  );
}
