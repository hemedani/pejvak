/**
 * The online-content vocabulary.
 *
 * Pejvak plays two kinds of audio: files the listener owns, and audio that
 * lives on someone else's server. This module describes the second kind without
 * knowing anything about *which* server — a source is described by data, and
 * every source speaks the same four questions (see `OnlineAdapter`).
 *
 * Nothing here touches the network or the database, so the mapping rules stay
 * testable on their own.
 */

/** A language the listener can look for audio in. */
export type OnlineLanguage = {
  /** Short code, e.g. `fa`. Stable — it is written into saved collections. */
  code: string;
  /** English name, for a predictable sort order. */
  name: string;
  /** The language's own name, which is what the listener recognises. */
  nativeName: string;
  direction: "ltr" | "rtl";
  /**
   * Whether any source serves this language today. The catalogue is deliberately
   * the whole world's languages — the ones without a source say so plainly
   * rather than being hidden, because "we have nothing here yet" is a different
   * answer from "this language does not exist".
   */
  available: boolean;
};

/**
 * Which adapter implementation serves a source.
 *
 * A kind is an implementation, not a provider: the archive's forty-six language
 * sources all have kind `archive` and share one adapter between them.
 */
export type OnlineSourceKind = "manahej" | "archive";

/** A provider of free audio for one language. */
export type OnlineSource = {
  /** Stable slug, e.g. `manahej`. Part of every collection key. */
  id: string;
  kind: OnlineSourceKind;
  /** Latin name, for the UI's smaller print. */
  name: string;
  /** The provider's own name. */
  nativeName: string;
  languageCode: string;
  /** The provider's home page — shown as attribution. */
  homepage: string;
  /** One line on what the source is, in the app's voice. */
  description: string;
};

/**
 * A collection: one show, album or course on a source.
 *
 * `key` is the identity that survives everything else. It is composed of the
 * source id and the source's own id for the collection, so the same show reached
 * from two devices — or from the Browse tab and from Favorites — is one row.
 */
export type OnlineCollection = {
  /** `${sourceId}:${externalId}`. The local id, the run's `context_key`, the route param. */
  key: string;
  sourceId: string;
  /** The source's own identifier for the collection. */
  externalId: string;
  title: string;
  /** A grouping line — "Show", "Book summaries", the author. Null when unknown. */
  subtitle: string | null;
  artworkUrl: string | null;
  trackCount: number;
  languageCode: string;
  /**
   * The human-facing address of the collection on the source's site, kept so a
   * downloaded course can still be traced back to where it came from.
   */
  pageUrl: string | null;
};

/**
 * One item inside a collection.
 *
 * `streamUrl` is deliberately *not* an identity: sources hand out signed URLs
 * that expire, so the same item has a different URL next week. `externalId` is
 * what is stable, and `contentHash` is derived from it (see
 * `onlineTrackHash`).
 */
export type OnlineTrack = {
  externalId: string;
  title: string;
  artist: string | null;
  albumTitle: string | null;
  artworkUrl: string | null;
  /** Playable URL. May be signed and expiring — treat it as short-lived. */
  streamUrl: string;
  /** Whole seconds; `0` when the source does not state a duration. */
  durationSec: number;
  /** 1-based position inside the collection. */
  order: number;
  pageUrl: string | null;
};

/** Why a source could not answer. Screens branch on this, not on a message. */
export type OnlineErrorCode =
  /** No usable connection. */
  | "offline"
  /** The source answered, but not with what we asked for. */
  | "not_found"
  /** The source answered with something we cannot read. */
  | "invalid_response"
  /** The request took too long. */
  | "timeout";

export class OnlineSourceError extends Error {
  readonly code: OnlineErrorCode;

  constructor(message: string, code: OnlineErrorCode) {
    super(message);
    this.name = "OnlineSourceError";
    this.code = code;
  }
}

/**
 * Everything a source has to be able to do.
 *
 * Three read operations and no writes: the app never posts to a source, so a
 * source is a catalogue to browse, not an account to hold.
 */
export type OnlineAdapter = {
  source: OnlineSource;
  /** Every collection this source offers for its language. */
  listCollections(options?: { signal?: AbortSignal }): Promise<OnlineCollection[]>;
  /** The collections this source groups under one show, when it has groups. */
  getTracks(collectionKey: string, options?: { signal?: AbortSignal }): Promise<OnlineTrack[]>;
};
