/**
 * What a history entry can *do*, in one place.
 *
 * Two kinds of entry are rendered as a card on more than one screen — a single
 * session on a track's own detail page, a whole listening stretch in the
 * History list — so the resume contract and the removal confirmation live here
 * rather than being re-implemented per screen. Two copies of "where does tapping
 * this resume from?" would eventually disagree, and the two lists would behave
 * differently for no reason.
 */

import { Alert } from "react-native";

import type { LocalContextPlay } from "@/lib/db/types";
import {
  resumeTargetSec,
  stretchResumeTarget,
  type HistoryItem,
  type HistoryStretch,
} from "@/lib/history";
import { describeStretchTracks, spansTracks } from "@/lib/listeningStretch";

/**
 * Route params that reopen the player at this session's position.
 *
 * Spread into `router.push({ pathname: "/player", params })`.
 */
export function sessionResumeParams(item: HistoryItem): {
  trackId: string;
  positionSec: string;
} {
  return {
    trackId: item.track.id,
    positionSec: String(resumeTargetSec(item)),
  };
}

/**
 * Route params that reopen the player where a listening stretch stopped.
 *
 * The track comes from the stretch's own target rather than from `entry.end`:
 * a stretch heard through replays from its first track, so reading the end here
 * would send the listener to the last file of a listen they already finished.
 */
export function stretchResumeParams(entry: HistoryStretch): {
  trackId: string;
  positionSec: string;
} {
  const target = stretchResumeTarget(entry);
  return {
    trackId: target.item.track.id,
    positionSec: String(target.positionSec),
  };
}

/**
 * Confirms removing a session, then runs `onConfirm`.
 *
 * The message states plainly that the removal is local. There is no server-side
 * delete act for sessions, so a copy already synced to another device stays
 * there — better said up front than discovered later.
 */
export function confirmRemoveSession(item: HistoryItem, onConfirm: () => void): void {
  Alert.alert(
    "Remove from history?",
    `Hides the session for "${item.track.title}" on this device. ` +
      "Copies already synced to your other devices are not affected.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: onConfirm },
    ],
  );
}

/**
 * Confirms removing a whole listening stretch, then runs `onConfirm`.
 *
 * The message names what is about to go, because a stretch row can stand for
 * hours of listening across several files and the listener is looking at one
 * line of text. Saying "3 tracks starting with X" is the difference between
 * removing a row and removing an evening.
 */
export function confirmRemoveStretch(entry: HistoryStretch, onConfirm: () => void): void {
  const { stretch } = entry;
  const what = spansTracks(stretch)
    ? `${describeStretchTracks(stretch)} starting with "${entry.start.track.title}"`
    : `the session for "${entry.start.track.title}"`;
  Alert.alert(
    "Remove from history?",
    `Hides ${what} on this device. ` +
      "Copies already synced to your other devices are not affected.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: onConfirm },
    ],
  );
}

/**
 * Confirms removing a collection run, then runs `onConfirm`.
 *
 * The same wording rule as a session, for the same reason: there is no
 * server-side delete act for runs either, so the removal hides the entry here
 * and nowhere else.
 */
export function confirmRemoveRun(run: LocalContextPlay, onConfirm: () => void): void {
  Alert.alert(
    "Remove from history?",
    `Hides this play-through of "${run.contextTitle}" on this device. ` +
      "Copies already synced to your other devices are not affected.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: onConfirm },
    ],
  );
}
