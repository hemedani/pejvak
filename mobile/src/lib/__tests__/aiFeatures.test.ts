/**
 * The AI catalogue.
 *
 * These are the rules the page cannot be allowed to break, expressed as tests
 * rather than as comments: four tools in a known order, a message that says
 * exactly what was asked for, and a colour per tool that a listener can
 * actually see. The contrast case is the one worth having — it is invisible in
 * a screenshot on the machine where the page was built, and obvious on a phone
 * in daylight.
 */

import {
  AI_COMING_SOON,
  AI_COMING_SOON_BODY,
  AI_COMING_SOON_HEADLINE,
  AI_FALLBACK_FEATURE,
  AI_FEATURES,
  aiFeatureFor,
  aiFeatureTint,
} from "../aiFeatures";
import { aurora, colors, type ColorScheme } from "@/theme/tokens";

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff)
  );
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("AI_FEATURES", () => {
  it("offers exactly the four tools, in the order the page shows them", () => {
    expect(AI_FEATURES.map((feature) => feature.id)).toEqual([
      "transcribe",
      "summarize",
      "audioSummary",
      "enhance",
    ]);
  });

  it("names each tool with the words the page promises", () => {
    expect(AI_FEATURES.map((feature) => feature.title)).toEqual([
      "Transcribe audio",
      "Summarize text",
      "Generate audio summary",
      "Remove noise and enhance audio",
    ]);
  });

  it("gives every tool its own glyph and its own colour", () => {
    expect(new Set(AI_FEATURES.map((feature) => feature.icon)).size).toBe(AI_FEATURES.length);
    expect(new Set(AI_FEATURES.map((feature) => feature.ramp[0])).size).toBe(
      AI_FEATURES.length,
    );
  });

  it("draws every tool's colour from the app's aurora ramps", () => {
    for (const feature of AI_FEATURES) {
      expect(aurora).toContain(feature.ramp);
    }
  });

  it("describes every tool in words, at both lengths", () => {
    for (const feature of AI_FEATURES) {
      expect(feature.blurb.length).toBeGreaterThan(0);
      // The detail line is the tool's own screen; a one-clause sentence there
      // reads as a placeholder rather than as an explanation.
      expect(feature.detail.length).toBeGreaterThan(60);
    }
  });
});

describe("the coming-soon message", () => {
  it("is the sentence the feature was asked for, word for word", () => {
    expect(AI_COMING_SOON).toBe(
      "Coming soon. Please help us purchase the server required for our AI features so we can enable these services soon.",
    );
  });

  it("splits into a headline and a body without losing anything", () => {
    // The screen typesets the two halves differently, so they must still
    // concatenate back to the whole message.
    expect(`${AI_COMING_SOON_HEADLINE} ${AI_COMING_SOON_BODY}`).toBe(AI_COMING_SOON);
  });
});

describe("aiFeatureFor", () => {
  it.each(AI_FEATURES.map((feature) => [feature.id, feature.title]))(
    "resolves %s",
    (id, title) => {
      expect(aiFeatureFor(id)?.title).toBe(title);
    },
  );

  it("takes the first value when a parameter arrives as an array", () => {
    expect(aiFeatureFor(["enhance", "summarize"])?.id).toBe("enhance");
  });

  it("resolves nothing for a link that names no tool", () => {
    expect(aiFeatureFor("transcribe-everything")).toBeNull();
    expect(aiFeatureFor("")).toBeNull();
    expect(aiFeatureFor(undefined)).toBeNull();
    expect(aiFeatureFor(null)).toBeNull();
  });
});

describe("aiFeatureTint", () => {
  it("uses the ramp's light stop on the dark canvas and its dark stop on the pale one", () => {
    for (const feature of AI_FEATURES) {
      expect(aiFeatureTint(feature, "light")).toBe(feature.ramp[0]);
      expect(aiFeatureTint(feature, "dark")).toBe(feature.ramp[1]);
    }
  });

  it("keeps every tool's mark above 3:1 against the card it sits on", () => {
    for (const scheme of ["light", "dark"] as const satisfies readonly ColorScheme[]) {
      for (const feature of AI_FEATURES) {
        const ratio = contrast(aiFeatureTint(feature, scheme), colors[scheme].surface);
        expect({ scheme, tool: feature.id, legible: ratio >= 3 }).toEqual({
          scheme,
          tool: feature.id,
          legible: true,
        });
      }
    }
  });

  it("keeps the fallback's mark legible too, since it is the page's own hero", () => {
    for (const scheme of ["light", "dark"] as const satisfies readonly ColorScheme[]) {
      expect(
        contrast(aiFeatureTint(AI_FALLBACK_FEATURE, scheme), colors[scheme].surface),
      ).toBeGreaterThan(3);
    }
  });
});
