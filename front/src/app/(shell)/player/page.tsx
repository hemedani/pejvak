import { resolveTrackForPlayer } from "@/app/actions/player/resolve-track-for-player";
import { PlayerScreen } from "@/components/player/player-screen";
import { playerTrackFromTrack } from "@/lib/player/from-track";
import type { PlayerTrack } from "@/lib/player/types";
import { firstParam, type SearchParamValue } from "@/lib/search-params";

export const metadata = { title: "پخش" };

/**
 * The player route.
 *
 * The deep link is resolved here, on the server, so the client never imports a
 * library action to answer "what is `trackId`?". The seed is a plain serialisable
 * snapshot; whether it becomes the queue is a client decision, because only the
 * store knows whether something is already playing.
 */
export default async function PlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ trackId?: SearchParamValue; positionSec?: SearchParamValue }>;
}) {
  const params = await searchParams;
  const trackId = firstParam(params.trackId);
  const positionRaw = Number.parseInt(firstParam(params.positionSec) ?? "", 10);
  const positionSec = Number.isFinite(positionRaw) && positionRaw >= 0 ? positionRaw : null;

  let seed: PlayerTrack | null = null;
  let seedFailed = false;

  if (trackId) {
    const result = await resolveTrackForPlayer(trackId);
    if (result.success && result.body) {
      seed = playerTrackFromTrack(result.body);
    } else {
      seedFailed = true;
    }
  }

  return <PlayerScreen seed={seed} seedPositionSec={positionSec} seedFailed={seedFailed} />;
}
