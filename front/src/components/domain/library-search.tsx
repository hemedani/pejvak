"use client";

/**
 * The library's search box.
 *
 * A **URL-writing** input: typing pushes `?q=` after a short pause and the server
 * re-renders the list. Three consequences, all deliberate:
 *
 *   · folding runs on the server (`lib/search.ts` is pure TypeScript and does not
 *     need the browser), so no search code ships to the client;
 *   · the query lives in the URL, so a filtered list can be reloaded, bookmarked
 *     and shared — a `useState` filter cannot;
 *   · `replace`, not `push`, so pressing back leaves the library instead of
 *     walking through one history entry per keystroke.
 *
 * The current params are read with `useSearchParams` rather than passed down as a
 * builder function: a function is not serialisable across the server/client
 * boundary, and passing it would fail at render rather than at compile time.
 *
 * The pause is 300 ms and the field owns its own text. A controlled-from-URL
 * input would render one round trip behind the keyboard.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";

const DEBOUNCE_MS = 300;

export function LibrarySearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(initialQuery);
  const committed = useRef(initialQuery);

  function hrefFor(query: string): string {
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim().length > 0) {
      params.set("q", query);
    } else {
      params.delete("q");
    }
    // A new query invalidates the page number: page 4 of the old result set is
    // almost certainly past the end of the new one.
    params.delete("page");
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

  useEffect(() => {
    // The URL is the source of truth: if a navigation changes it (a sort link, a
    // back button), the field follows.
    if (initialQuery !== committed.current) {
      committed.current = initialQuery;
      setValue(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (value === committed.current) {
      return;
    }

    const timer = setTimeout(() => {
      committed.current = value;
      router.replace(hrefFor(value), { scroll: false });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `hrefFor` closes over `searchParams`, which changes identity on navigation;
    // depending on it directly would restart the timer on unrelated navigations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, router]);

  function clear() {
    setValue("");
    committed.current = "";
    router.replace(hrefFor(""), { scroll: false });
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-[var(--space-md)] grid place-items-center text-text-tertiary">
        <Icon name="search" size="sm" />
      </span>

      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="جست‌وجوی عنوان، نویسنده یا مجموعه…"
        aria-label="جست‌وجو در کتابخانه"
        className="h-11 w-full rounded-[var(--radius-pill)] border border-outline-strong bg-surface-sunken ps-10 pe-[var(--space-lg)] type-body text-text placeholder:text-text-tertiary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />

      {value.length > 0 ? (
        <button
          type="button"
          onClick={clear}
          aria-label="پاک کردن جست‌وجو"
          className="absolute inset-y-0 end-[var(--space-sm)] grid place-items-center px-[var(--space-sm)] text-text-tertiary hover:text-text"
        >
          <Icon name="close" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
