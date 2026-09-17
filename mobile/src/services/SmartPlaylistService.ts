import type { PlaylistItem } from "@/lib/db/types";
import {
  SMART_RULES,
  buildSmartPlaylist,
  buildSmartPlaylists,
  type SmartContext,
  type SmartPlaylist,
  type SmartPlaylistOptions,
  type SmartPick,
  type SmartRuleId,
} from "@/lib/smartPlaylists";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

/**
 * Loads everything the engine reasons about, in three queries.
 *
 * `getLiveSessions` rather than `getAllSessions`: a history entry the listener
 * deleted must stop influencing recommendations, and the tombstone-keeping
 * variant exists only for reconciliation.
 */
async function loadContext(now: number): Promise<SmartContext> {
  const [tracks, sessions, annotationCounts] = await Promise.all([
    LocalDBService.getAllTracks(),
    LocalDBService.getLiveSessions(),
    LocalDBService.getAnnotationCounts(),
  ]);
  return { tracks, sessions, annotationCounts, now };
}

/**
 * Smart playlists are computed, never stored.
 *
 * A recipe is a *question* about the library ("what did I stop half-way
 * through?"), and the answer changes as the library does. Persisting one as a
 * playlist row would freeze that answer, lose the reasoning, and push hundreds
 * of items to the server for something the device can derive in microseconds.
 * Saving a copy is offered separately, and that one *is* a real playlist.
 */
export const SmartPlaylistService = {
  /**
   * Every recipe with its current picks. The Playlists tab shows only the
   * counts, but building all five over one history index is cheaper than
   * loading the context five times.
   */
  async listAll(options: SmartPlaylistOptions = {}, now: number = Date.now()) {
    return buildSmartPlaylists(
      SMART_RULES.map((rule) => rule.id),
      await loadContext(now),
      options,
    );
  },

  async build(
    ruleId: SmartRuleId,
    options: SmartPlaylistOptions = {},
    now: number = Date.now(),
  ): Promise<SmartPlaylist> {
    return buildSmartPlaylist(ruleId, await loadContext(now), options);
  },

  /** Starts the list. Returns the entry track id, or null when it is empty. */
  async play(picks: readonly SmartPick[]): Promise<string | null> {
    const queueIds = picks.map((pick) => pick.track.id);
    const entryId = queueIds[0];
    if (!entryId) {
      return null;
    }
    await TrackPlayerService.playQueueAt(queueIds, 0);
    return entryId;
  },

  /**
   * Freezes the current picks into a real playlist.
   *
   * One `updatePlaylist` rather than N `addTrack` calls — each of those re-reads
   * the playlist and rewrites the whole item list.
   */
  async saveAsPlaylist(title: string, picks: readonly SmartPick[]): Promise<string | null> {
    if (picks.length === 0) {
      return null;
    }
    const playlist = await PlaylistService.create(title);
    const items: PlaylistItem[] = picks.map((pick, index) => ({
      trackId: pick.track.id,
      order: index,
    }));
    await LocalDBService.updatePlaylist(playlist.id, { items });
    return playlist.id;
  },
};
