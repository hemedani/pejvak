/**
 * One provider, as a card on a language's page.
 *
 * The whole card is the link and the arrow sits at the end edge, because a
 * source is a place to go rather than something to select. Two badges carry the
 * facts a listener needs before opening it: which language they will hear, and —
 * only when it is true — that the audio never ends.
 *
 * **No logo.** None of these sources publishes a mark with a licence that lets
 * it be shown here, and hotlinking a favicon is a request to a third party on a
 * page that is otherwise the listener's own. A name in the source's own words is
 * both accurate and honest about what is known.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { findLanguage } from "@/lib/online/languages";
import type { OnlineSource } from "@/lib/online/types";

export function SourceCard({ source, href }: { source: OnlineSource; href: string }) {
  const language = findLanguage(source.languageCode);

  return (
    <Card className="p-0 transition-shadow duration-150 hover:shadow-[var(--elevation-panel)]">
      <Link
        href={href}
        className="flex items-center gap-[var(--space-md)] rounded-[var(--radius-card)] p-[var(--space-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <div className="min-w-0 flex-1">
          <p className="type-overline text-text-tertiary">{source.name}</p>
          <p className="type-heading mt-[var(--space-xxs)] truncate text-text">{source.nativeName}</p>
          <p className="type-caption mt-[var(--space-xs)] line-clamp-2 text-text-secondary">
            {source.description}
          </p>

          <div className="mt-[var(--space-sm)] flex flex-wrap items-center gap-[var(--space-xs)]">
            {language ? (
              <Badge tone="neutral" size="sm">
                {language.nativeName}
              </Badge>
            ) : null}
            {source.live ? (
              <Badge tone="accent" size="sm">
                زنده
              </Badge>
            ) : null}
          </div>
        </div>

        <Icon name="end" size="md" className="shrink-0 text-text-tertiary" />
      </Link>
    </Card>
  );
}
