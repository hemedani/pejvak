/**
 * The language catalogue, as rows.
 *
 * This is deliberately **not** a client component: it draws a list it was given
 * and nothing else. `LanguageSearch` wraps it with the one piece of state the
 * screen needs, which keeps the row markup in one place and lets a plain
 * server-rendered list exist without shipping a search field for it.
 *
 * The order is the catalogue's own — English name, ascending — and never the
 * UI locale's. It is the one order that is the same on every device and in every
 * language, which is what makes the list learnable.
 *
 * An unavailable language is **shown and marked**, not hidden. "We have nothing
 * in this language yet" and "this language does not exist" are different answers,
 * and a list that silently drops 30 entries reads as a bug rather than as a
 * scope decision.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/state";
import type { OnlineLanguage } from "@/lib/online/types";

export function LanguageRow({ language }: { language: OnlineLanguage }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="type-label truncate text-text" dir={language.direction}>
          {language.nativeName}
        </p>
        <p className="type-caption truncate text-text-tertiary">{language.name}</p>
      </div>

      {/* An ISO code is Latin by definition; `dir="ltr"` stops it being reordered
          into nonsense inside the RTL row. */}
      <span className="type-numeric shrink-0 text-text-tertiary" dir="ltr">
        {language.code}
      </span>

      {language.available ? (
        <Icon name="end" size="sm" className="shrink-0 text-text-tertiary" />
      ) : (
        <Badge tone="muted" size="sm">
          Coming soon
        </Badge>
      )}
    </>
  );

  if (!language.available) {
    return (
      <div className="flex items-center gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-md)]">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/browse/language/${language.code}`}
      className="flex items-center gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-md)] transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
    >
      {content}
    </Link>
  );
}

export function LanguageList({ languages }: { languages: readonly OnlineLanguage[] }) {
  return (
    <ul className="divide-y divide-outline-variant">
      {languages.map((language) => (
        <li key={language.code}>
          <LanguageRow language={language} />
        </li>
      ))}
    </ul>
  );
}

/** Ten row-shaped placeholders, for the catalogue before it paints. */
export function LanguageListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-outline-variant rounded-[var(--radius-card)] border border-outline-variant bg-surface"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-md)]">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-[var(--space-xs)] h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-6" />
        </div>
      ))}
    </div>
  );
}
