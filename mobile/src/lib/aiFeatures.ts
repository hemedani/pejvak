/**
 * The four things the AI page promises, and the words it promises them in.
 *
 * The page is a catalogue before it is a screen: every card, every hero, every
 * "coming soon" panel is a drawing of one entry in this list. Keeping the list
 * here means the copy cannot drift between the grid that advertises a tool and
 * the screen that explains why it is not ready, and it means the screen is
 * testable without a renderer.
 *
 * ## Why the identity is a colour pair rather than a colour
 *
 * Each tool is given one of the app's aurora ramps, so the four cards in the
 * grid read as four *different* things at a glance — the same trick the library
 * uses to tell tracks apart. But a ramp's first stop is tuned to sit on a light
 * canvas, and the same stop on the dark canvas is nearly invisible. So the
 * colour a card paints its glyph with is not the ramp's first stop: it is
 * whichever stop the current scheme can actually read. That decision is
 * `aiFeatureTint`, and it is here rather than in a component because two
 * screens make it and they must make it the same way.
 */

import type { IconName } from "@/components/ui/icon";
import { aurora, type AuroraRamp, type ColorScheme } from "@/theme/tokens";

export type AiFeatureId = "transcribe" | "summarize" | "audioSummary" | "enhance";

export type AiFeature = {
  id: AiFeatureId;
  /** The button's words. Imperative, and short enough for a 2-up card. */
  title: string;
  /** One line under the title: what you get, not how it works. */
  blurb: string;
  /**
   * A sentence for the tool's own screen. Written for someone who has already
   * decided they want it and is now being told what it would have done.
   */
  detail: string;
  icon: IconName;
  ramp: AuroraRamp;
};

/**
 * The catalogue, in the order the page shows it: the two that work on words
 * first (in → out), then the one that turns words back into audio, then the one
 * that works on the audio itself.
 *
 * ## Why these four ramps
 *
 * Not every aurora ramp can carry a glyph. The amber and cyan stops are bright
 * enough that a glyph drawn in them lands under 3:1 on a pale card — legible
 * only if you already know what it says — and the coral one is a rounding error
 * away from the same problem. The four here are the ramps whose *light* stop is
 * dark enough to clear 3:1 against the card surface in light mode while their
 * *tint* clears it against the card surface in dark mode. That constraint, not
 * taste, is what picked them, and `aiFeatures.test.ts` holds it in place: add a
 * fifth tool with a bright ramp and the test fails rather than the page quietly
 * shipping an unreadable mark.
 */
export const AI_FEATURES: readonly AiFeature[] = [
  {
    id: "transcribe",
    title: "Transcribe audio",
    blurb: "Words, with timecodes",
    detail:
      "Turns a recording into text you can read, search and copy — one timed line per phrase, so every word still points at the moment it was said.",
    icon: "transcribe",
    ramp: aurora[1],
  },
  {
    id: "summarize",
    title: "Summarize text",
    blurb: "The argument, not the transcript",
    detail:
      "Reads a transcript or a note and gives back what it actually said: the points, in order, in a fraction of the words — enough to decide whether the whole thing is worth your evening.",
    icon: "summarize",
    ramp: aurora[2],
  },
  {
    id: "audioSummary",
    title: "Generate audio summary",
    blurb: "A briefing you can listen to",
    detail:
      "Speaks the summary back in a natural voice, so you can hear what a book is about on the walk home and start it already knowing where it goes.",
    icon: "audioSummary",
    ramp: aurora[6],
  },
  {
    id: "enhance",
    title: "Remove noise and enhance audio",
    blurb: "Cleaner speech, less hiss",
    detail:
      "Strips hiss, hum and room echo, then lifts the voice back out of it — for the lecture recorded on a phone at the back of the hall, and the cassette that has been copied twice.",
    icon: "enhance",
    ramp: aurora[0],
  },
];

/**
 * The message every tool shows until the server exists.
 *
 * Kept as two sentences rather than one string because the screen sets the
 * first as a headline and the second as body copy — the same words, typeset.
 * `AI_COMING_SOON` is the whole thing, for anything that needs it in one piece
 * (a screen reader label, a test, a future support link).
 */
export const AI_COMING_SOON_HEADLINE = "Coming soon.";

export const AI_COMING_SOON_BODY =
  "Please help us purchase the server required for our AI features so we can enable these services soon.";

export const AI_COMING_SOON = `${AI_COMING_SOON_HEADLINE} ${AI_COMING_SOON_BODY}`;

/**
 * What an unknown tool id resolves to.
 *
 * A link can carry anything, and the honest answer to "transcribe" when the
 * catalogue has no such tool is not a redirect and not a blank frame — it is a
 * page that still explains why none of this is live. It deliberately does not
 * borrow a tool's name or colour: it says "AI tools", which is true.
 */
export const AI_FALLBACK_FEATURE: AiFeature = {
  id: "transcribe",
  title: "AI tools",
  blurb: "Four tools, one server away",
  detail:
    "Transcription, summaries, spoken summaries and audio cleanup. All four need the same thing — a server to run them on.",
  icon: "ai",
  ramp: aurora[0],
};

/** The tool a route parameter names, or `null` when it names nothing real. */
export function aiFeatureFor(id: string | string[] | undefined | null): AiFeature | null {
  const key = Array.isArray(id) ? id[0] : id;
  if (!key) {
    return null;
  }
  return AI_FEATURES.find((feature) => feature.id === key) ?? null;
}

/**
 * The readable stop of a tool's ramp in the current scheme.
 *
 * A ramp is `[dark, light, deep]`: the first stop is a saturated colour meant
 * for a pale canvas, the second is its tint. On the dark canvas the first stop
 * sits within a couple of percent of the card behind it, so the glyph would
 * disappear — the light stop is what survives there.
 *
 * Whichever one comes back is a *glyph* colour, so it is held to the 3:1 floor
 * WCAG asks of a graphical object rather than to a text ratio: the words beside
 * it carry the meaning, and a mark that reads as a coloured smudge is still a
 * decoration that failed.
 */
export function aiFeatureTint(feature: AiFeature, scheme: ColorScheme): string {
  return scheme === "dark" ? feature.ramp[1] : feature.ramp[0];
}
