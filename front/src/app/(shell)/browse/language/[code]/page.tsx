import Link from "next/link";
import { notFound } from "next/navigation";

import { SourceList } from "@/components/online/source-list";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state";
import { formatCount } from "@/lib/format";
import { findLanguage, sourcesForLanguage } from "@/lib/online";

/**
 * The sources that serve one language.
 *
 * No adapter runs here: a source's name, description and language are compiled
 * into the app, so this page is instant even when every provider is down. That
 * is deliberate — the step before a network call is the one place a slow source
 * must not be able to make the app feel slow.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const language = findLanguage(code);
  return { title: language ? language.nativeName : "Language" };
}

export default async function LanguagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const language = findLanguage(code);
  if (!language) {
    notFound();
  }

  const sources = sourcesForLanguage(language.code);

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <Link
        href="/browse"
        className="type-caption inline-flex w-fit items-center gap-[var(--space-xs)] text-text-secondary transition-colors hover:text-text"
      >
        <Icon name="start" size="sm" />
        All languages
      </Link>

      <PageHeader
        overline="Language"
        title={language.nativeName}
        description={
          sources.length > 0
            ? `${language.name} · ${formatCount(sources.length, "source")}`
            : `${language.name} · no sources yet`
        }
      />

      {sources.length === 0 ? (
        <Card>
          <EmptyState
            icon="browse"
            title="No source for this language yet"
            description="The language list is complete, but not every language has a source yet."
            action={{ label: "Another language", href: "/browse" }}
          />
        </Card>
      ) : (
        <SourceList sources={sources} languageCode={language.code} />
      )}
    </div>
  );
}
