import { foldText } from "@/lib/search";

export type AddTagResult =
  | { tags: string[]; added: true }
  | {
      tags: string[];
      added: false;
      reason: "empty" | "duplicate" | "limit" | "too-long";
    };

/** Same limits the composer shows. Kept here so the pure helper owns them. */
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_MAX_LENGTH = 24;

/**
 * Adds one tag, folding before the duplicate check.
 *
 * The fold is the whole point: «كتاب» and «کتاب» are the same word typed on two
 * keyboards, and a tag list that keeps both is a list that hides half its own
 * notes from the filter. Trimming and collapsing whitespace happens before the
 * length check so "  a  b  " is measured as the value it will become.
 */
export function addTag(
  tags: readonly string[],
  draft: string,
  limits?: { maxTags?: number; maxLength?: number },
): AddTagResult {
  const maxTags = limits?.maxTags ?? DEFAULT_MAX_TAGS;
  const maxLength = limits?.maxLength ?? DEFAULT_MAX_LENGTH;
  const candidate = draft.trim().replace(/\s+/g, " ");

  if (candidate.length === 0) {
    return { tags: [...tags], added: false, reason: "empty" };
  }
  if (candidate.length > maxLength) {
    return { tags: [...tags], added: false, reason: "too-long" };
  }

  const folded = foldText(candidate);
  if (tags.some((tag) => foldText(tag) === folded)) {
    return { tags: [...tags], added: false, reason: "duplicate" };
  }
  if (tags.length >= maxTags) {
    return { tags: [...tags], added: false, reason: "limit" };
  }

  return { tags: [...tags, candidate], added: true };
}

/** Removes one tag, leaving every other one in place. */
export function removeTag(tags: readonly string[], index: number): string[] {
  return tags.filter((_, at) => at !== index);
}
