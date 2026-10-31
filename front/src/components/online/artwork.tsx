"use client";

/**
 * A collection's cover, or a stand-in derived from its identity.
 *
 * Two things this is not:
 *
 *   · **Not `next/image`.** A source's cover is an arbitrary remote URL on a
 *     host that is not in `remotePatterns`, and the archive alone spreads its
 *     files over a dozen `ia*.us.archive.org` hosts. Adding each one is a
 *     maintenance trap that breaks silently the week a source adds a bucket, so
 *     a plain `<img>` with `loading="lazy"` is the honest choice here.
 *   · **Not a client island for its own sake.** It is one because a broken
 *     cover is only knowable in the browser: the URL is valid and the response
 *     is a 404, or the host refuses a hotlink. `onError` is the only signal, and
 *     it is what keeps a grid of dead images from looking like a broken app.
 *
 * The fallback is keyed by the collection key, so a coverless show keeps the
 * same tint on every visit — a random gradient per render would read as a
 * different collection each time. It shows the title's first letter, because a
 * Persian initial identifies a Persian title at a glance; the icon is the
 * last resort for a title that starts with something unrenderable.
 */

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

function hueFor(key: string): number {
  let sum = 0;
  for (let index = 0; index < key.length; index += 1) {
    sum = (sum * 31 + key.charCodeAt(index)) % 360;
  }
  return sum;
}

/** The first letter of a title, or null when there is nothing worth drawing. */
function initialOf(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // `Array.from` rather than `[0]`: an emoji or a combining mark is one visible
  // character and two code units, and half of one is not a letter.
  return Array.from(trimmed)[0] ?? null;
}

export function OnlineArtwork({
  artworkUrl,
  title,
  paletteKey,
  className,
}: {
  artworkUrl: string | null;
  title: string;
  /** Seeds the fallback tint — the collection key, never a random value. */
  paletteKey: string;
  className?: string;
}) {
  // The URL that failed, not a boolean: when the source hands a new cover on the
  // next render, a boolean would keep the fallback for a working image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = artworkUrl !== null && failedUrl !== artworkUrl;
  const initial = initialOf(title);
  const hue = hueFor(paletteKey);

  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)] bg-surface-sunken",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 36% 32%), hsl(${(hue + 48) % 360} 30% 19%))`,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- see the note at the top of this file.
        <img
          src={artworkUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(artworkUrl)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-white/90">
          {initial ? (
            <span className="type-heading select-none" aria-hidden>
              {initial}
            </span>
          ) : (
            <Icon name="book" size="xl" />
          )}
        </span>
      )}
    </div>
  );
}
