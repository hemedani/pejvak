/**
 * The sources that serve one language.
 *
 * The link carries `?language=` even for a source that serves only one: the
 * source page reads it as "the language the listener arrived with" and uses it
 * for the badge and for a search that stays inside that language. Building the
 * href here, once, is what keeps a multi-language source from losing the choice
 * between the list and the page it opens.
 */

import { SourceCard } from "@/components/online/source-card";
import type { OnlineSource } from "@/lib/online/types";

export function SourceList({
  sources,
  languageCode,
}: {
  sources: readonly OnlineSource[];
  languageCode: string;
}) {
  return (
    <ul className="flex flex-col gap-[var(--space-sm)]">
      {sources.map((source) => (
        <li key={source.id}>
          <SourceCard
            source={source}
            href={`/browse/source/${source.id}?language=${encodeURIComponent(languageCode)}`}
          />
        </li>
      ))}
    </ul>
  );
}
