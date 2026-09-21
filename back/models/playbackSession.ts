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
import { track_excludes, user_excludes } from "./excludes.ts";

export const session_pure = {
  clientId: optional(string()),
  contentHash: optional(string()),
  startedAt: number(),
  endedAt: optional(number()),
  startPositionSec: defaulted(number(), 0),
  endPositionSec: defaulted(number(), 0),
  durationListenedSec: defaulted(number(), 0),
  playbackSpeed: defaulted(number(), 1),
  completed: defaulted(boolean(), false),
  interrupted: defaulted(boolean(), false),
  deviceInfo: optional(string()),
  /**
   * The collection run this session was part of, if any.
   *
   * Denormalised from the run rather than reached through a relation: a run
   * outlives the playlist it names, and `syncLocalData` receives all three
   * fields in the same flat payload as the session itself. `contextPlayId` is
   * the run's client id, which is also the id the client uses for its own row —
   * so a pulled session can be grouped back into its run without a lookup
   * table.
   */
  contextPlayId: optional(string()),
  contextType: optional(string()),
  contextKey: optional(string()),
  /**
   * The listening stretch this session belongs to.
   *
   * A stretch is one continuous listen: the client groups its per-track rows by
   * this id, so a book heard over five tracks reads as one History entry and
   * gets one verdict on whether it was heard through. Flat for the same reason
   * `contextPlayId` is — a session row has to be able to name its group without
   * a lookup, including on a device that never saw the other members.
   */
  stretchId: optional(string()),
  /**
   * Whether the listener scrubbed during the session.
   *
   * Stored rather than derived: "heard from the first second through to the end"
   * cannot be reconstructed from the timestamps, because a scrub leaves a
   * perfectly plausible position behind. Without this a seek forward would be
   * indistinguishable from listening, and would read as a complete listen.
   */
  seeked: defaulted(boolean(), false),
  ...createUpdateAt,
};

export const session_relations = {
  track: {
    schemaName: "track",
    type: "single" as RelationDataType,
    optional: false,
    excludes: track_excludes,
    relatedRelations: {
      sessions: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      sessions: {
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

export const playbackSessions = () =>
  coreApp.odm.newModel("playbackSession", session_pure, session_relations, {
    createIndex: {
      indexSpec: { clientId: 1 },
      options: { unique: true, sparse: true },
    },
  });
