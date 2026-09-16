/**
 * What a history entry can *do*, in one place.
 *
 * A `HistoryItem` is rendered as a `SessionCard` on more than one screen — the
 * History list and a track's own detail page — so the resume contract and the
 * removal confirmation live here rather than being re-implemented per screen.
 * Two copies of "where does tapping this resume from?" would eventually
 * disagree, and the two lists would behave differently for no reason.
 */

import { Alert } from "react-native";

import { resumeTargetSec, type HistoryItem } from "@/lib/history";

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
