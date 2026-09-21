import { coreApp } from "../mod.ts";
import {
  boolean,
  defaulted,
  number,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

/**
 * A run through a collection — the level above a playback session.
 *
 * A session records one continuous period of listening to one track. That is
 * not enough to answer either of the questions the listener asks about a
 * playlist or a folder: "have I heard this through?" needs the sessions of one
 * attempt to be recognised as one attempt, and "where was I?" needs a place to
 * remember the position inside the collection rather than inside a file.
 *
 * `contextKey` identifies the collection: a playlist's client id, or a folder
 * key. A folder has no server-side row — it is a path the device discovered —
 * so the key is stored verbatim rather than resolved to a relation. That is
 * also why there is no `playlist` relation here: a run must survive the
 * playlist being deleted, because the listening happened.
 *
 * `listenedSec` and `finishedCount` are computed from the run's own sessions
 * when it is closed, so they cannot disagree with the session rows they
 * summarise. `trackCount` is the size of the queue when the run started and is
 * informational only: completion is recorded in `completed`, which means the
 * queue genuinely ran out.
 */
export const context_pure = {
  /** Stable per-device id so offline pushes stay idempotent across retries. */
  clientId: optional(string()),
  contextType: string(),
  contextKey: string(),
  /** Captured at play time; a later rename must not rewrite history. */
  contextTitle: string(),
  trackCount: defaulted(number(), 0),
  startedAt: number(),
  endedAt: optional(number()),
  lastIndex: defaulted(number(), 0),
  lastTrackId: optional(string()),
  lastPositionSec: defaulted(number(), 0),
  listenedSec: defaulted(number(), 0),
  finishedCount: defaulted(number(), 0),
  completed: defaulted(boolean(), false),
  interrupted: defaulted(boolean(), false),
  ...createUpdateAt,
};

export const context_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      playbackContexts: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const playbackContexts = () =>
  coreApp.odm.newModel("playbackContext", context_pure, context_relations, {
    createIndex: {
      indexSpec: { clientId: 1 },
      options: { unique: true, sparse: true },
    },
  });
