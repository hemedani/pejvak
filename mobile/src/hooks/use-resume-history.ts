/**
 * Picking a history entry back up — the one implementation of it.
 *
 * Three screens can start a listen from something already in the history: the
 * History list (a stretch), a track's own screen (one session) and the
 * Collections tab (a whole run). All three have to drop the playhead in the same
 * place, and the rules are not obvious ones:
 *
 *   - A **stretch** that was part of a collection resumes *the collection*, not
 *     the track. The listener stopped inside a folder or a playlist, and dropping
 *     them into a queue of one would end the series at that lecture — and would
 *     record a fresh single-track run against nothing. If the collection has since
 *     gone, or no longer holds that track, the plain single-track resume is the
 *     right fallback.
 *   - A **run** is rebuilt from the folder or playlist as it stands now, so a
 *     lecture added since the last listen is included and a removed one is not.
 *   - A **session** is a bare track, so it reopens alone.
 *
 * Living here rather than in each screen is what stops three copies of that
 * reasoning from drifting — the reason `lib/sessionActions.ts` exists for the
 * route params, one level down.
 */

import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";

import type { LocalContextPlay } from "@/lib/db/types";
import { stretchResumeTarget, type HistoryItem, type HistoryStretch } from "@/lib/history";
import { sessionResumeParams, stretchResumeParams } from "@/lib/sessionActions";
import { ContextService } from "@/services/ContextService";

export type HistoryResumeTarget =
  | { kind: "stretch"; entry: HistoryStretch }
  | { kind: "session"; item: HistoryItem }
  | { kind: "run"; run: LocalContextPlay };

export function useResumeHistory(): (target: HistoryResumeTarget) => Promise<void> {
  const router = useRouter();

  return useCallback(
    async (target: HistoryResumeTarget) => {
      if (target.kind === "run") {
        const trackId = await ContextService.resume(target.run);
        if (!trackId) {
          Alert.alert(
            "Nothing to play",
            `"${target.run.contextTitle}" has no playable tracks any more — it may have been deleted or emptied.`,
          );
          return;
        }
        router.push({ pathname: "/player", params: { trackId } });
        return;
      }

      if (target.kind === "session") {
        router.push({ pathname: "/player", params: sessionResumeParams(target.item) });
        return;
      }

      const { entry } = target;
      const resolved = stretchResumeTarget(entry);
      if (entry.stretch.contextType && entry.stretch.contextKey !== null) {
        const trackId = await ContextService.startAt(
          { type: entry.stretch.contextType, key: entry.stretch.contextKey },
          resolved.item.track.id,
          resolved.positionSec,
        );
        if (trackId) {
          router.push({ pathname: "/player", params: { trackId } });
          return;
        }
      }
      router.push({ pathname: "/player", params: stretchResumeParams(entry) });
    },
    [router],
  );
}
