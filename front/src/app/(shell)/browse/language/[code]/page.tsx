import Link from "next/link";
import { notFound } from "next/navigation";

import { SourceList } from "@/components/online/source-list";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state";
import { fa } from "@/lib/format";
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
  return { title: language ? language.nativeName : "زبان" };
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
        همهٔ زبان‌ها
      </Link>

      <PageHeader
        overline="زبان"
        title={language.nativeName}
        description={
          sources.length > 0
            ? `${language.name} · ${fa(sources.length)} منبع`
            : `${language.name} · هنوز منبعی نیست`
        }
      />

      {sources.length === 0 ? (
        <Card>
          <EmptyState
            icon="browse"
            title="هنوز منبعی برای این زبان نیست"
            description="فهرست زبان‌ها کامل است، اما هر زبانی هنوز منبعی ندارد."
            action={{ label: "زبان دیگر", href: "/browse" }}
          />
        </Card>
      ) : (
        <SourceList sources={sources} languageCode={language.code} />
      )}
    </div>
  );
}
