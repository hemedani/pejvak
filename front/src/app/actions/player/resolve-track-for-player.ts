"use server";

/**
 * A deep link (`/player?trackId=…`) needs one track before the player has a
 * queue. This is `getTrackDetail` behind a player-shaped name, so the client
 * never imports the library action and the projection stays in one place.
 */

import { getTrackDetail } from "@/app/actions/tracks/get-track-detail";
import type { TrackDetail } from "@/lib/domain/track";
import type { ActResult } from "@/lib/result";

export async function resolveTrackForPlayer(
  trackId: string,
): Promise<ActResult<TrackDetail | null>> {
  return getTrackDetail(trackId);
}
