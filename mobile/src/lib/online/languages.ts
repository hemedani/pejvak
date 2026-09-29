/**
 * The world's languages, as the Browse tab's first step.
 *
 * The list is deliberately the *languages* rather than the sources: the
 * listener thinks in "I want something in Persian", not in "I want
 * manahej.ir". Sources hang off a language (see `sources.ts`), and a language
 * with no source yet says so instead of disappearing — a short list that
 * silently omits most of the world reads as a bug, not as a scope decision.
 *
 * Ordered by English name so the list has one predictable order on every
 * device, whatever the locale.
 */

import { ARCHIVE_LANGUAGE_CODES } from "@/lib/online/archive";
import type { OnlineLanguage } from "@/lib/online/types";

type LanguageSeed = Omit<OnlineLanguage, "available">;

const SEED: LanguageSeed[] = [
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca", direction: "ltr" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", direction: "ltr" },
  { code: "my", name: "Burmese", nativeName: "မြန်မာ", direction: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", direction: "ltr" },
  { code: "cs", name: "Czech", nativeName: "Čeština", direction: "ltr" },
  { code: "da", name: "Danish", nativeName: "Dansk", direction: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", direction: "ltr" },
  { code: "en", name: "English", nativeName: "English", direction: "ltr" },
  { code: "fi", name: "Finnish", nativeName: "Suomi", direction: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", direction: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", direction: "ltr" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", direction: "ltr" },
  { code: "he", name: "Hebrew", nativeName: "עברית", direction: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", direction: "ltr" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", direction: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", direction: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", direction: "ltr" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша", direction: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", direction: "ltr" },
  { code: "ku", name: "Kurdish", nativeName: "Kurdî", direction: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", direction: "ltr" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", direction: "ltr" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", direction: "ltr" },
  { code: "no", name: "Norwegian", nativeName: "Norsk", direction: "ltr" },
  { code: "ps", name: "Pashto", nativeName: "پښتو", direction: "rtl" },
  { code: "fa", name: "Persian", nativeName: "فارسی", direction: "rtl" },
  { code: "pl", name: "Polish", nativeName: "Polski", direction: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", direction: "ltr" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", direction: "ltr" },
  { code: "ro", name: "Romanian", nativeName: "Română", direction: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", direction: "ltr" },
  { code: "sr", name: "Serbian", nativeName: "Српски", direction: "ltr" },
  { code: "si", name: "Sinhala", nativeName: "සිංහල", direction: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", direction: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", direction: "ltr" },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog", direction: "ltr" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", direction: "ltr" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", direction: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", direction: "ltr" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", direction: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", direction: "ltr" },
  { code: "ur", name: "Urdu", nativeName: "اردو", direction: "rtl" },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbekcha", direction: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", direction: "ltr" },
];

/**
 * Languages that have at least one source registered.
 *
 * Derived rather than hand-written, so the flag cannot drift away from the
 * registry in either direction: a language cannot be offered without a source
 * behind it, and cannot stay greyed out after a source has been added for it.
 * The archive covers every language in the catalogue, so the only thing left to
 * state by hand is which languages a *different* source serves —
 * `registry.test.ts` fails if a source is registered whose language is not
 * marked available here.
 */
const NON_ARCHIVE_CODES = ["fa"]; // manahej.ir

const AVAILABLE_CODES = new Set([...ARCHIVE_LANGUAGE_CODES, ...NON_ARCHIVE_CODES]);

export const LANGUAGES: readonly OnlineLanguage[] = SEED.map((language) => ({
  ...language,
  available: AVAILABLE_CODES.has(language.code),
}));

/** Hebrew, Arabic, Syriac, Thaana, and the Arabic presentation forms. */
const RTL_CHARS = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
const LTR_CHARS = /[A-Za-z\u00C0-\u024F]/g;

/**
 * Whether a string reads right to left.
 *
 * Every title this feature shows is likely to be Persian or Arabic, and a
 * right-to-left line left-aligned inside a left-to-right layout reads as broken
 * rather than as foreign. Counted rather than "contains a Persian character", so
 * an English title that happens to carry one loanword is not flipped — and so a
 * Latin track name inside a Persian course stays left-aligned.
 */
export function isRtlText(value: string): boolean {
  const rtl = value.match(RTL_CHARS)?.length ?? 0;
  if (rtl === 0) {
    return false;
  }
  const ltr = value.match(LTR_CHARS)?.length ?? 0;
  return rtl > ltr;
}

export function findLanguage(code: string): OnlineLanguage | null {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

/**
 * Languages that can actually be browsed, in list order.
 *
 * The Browse tab shows the full catalogue with the empty ones marked; this is
 * for the places that must not offer a dead end (a "browse another language"
 * shortcut, the Favorites empty state).
 */
export const AVAILABLE_LANGUAGES: readonly OnlineLanguage[] = LANGUAGES.filter(
  (language) => language.available,
);
