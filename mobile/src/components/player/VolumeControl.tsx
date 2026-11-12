/**
 * The player's own output level, on the player.
 *
 * It is the same control as the background tone beside it — same track, same
 * thumb, same readout — because it is the same job: one number the listener
 * sets by dragging, and the two are compared constantly ("the tone is under the
 * voice; is the voice loud enough?"). Putting the volume in a system slider
 * behind a hardware button and the tone on the screen would make the pair
 * impossible to judge against each other.
 *
 * The value lives in the player store and is written by `TrackPlayerService`,
 * never set here: the slider and the audio cannot disagree if only one of them
 * is allowed to be the source.
 */

import { LevelSliderRow } from "@/components/player/LevelSliderRow";
import { describeLevel } from "@/lib/audioEffects";
import * as TrackPlayerService from "@/services/TrackPlayerService";
import { usePlayerStore } from "@/store/playerStore";

export type VolumeControlProps = {
  /** Colour of the filled track — the track's own aurora accent. */
  tint: string;
};

export function VolumeControl({ tint }: VolumeControlProps) {
  const volume = usePlayerStore((state) => state.volume);

  return (
    <LevelSliderRow
      icon="volume"
      label="Volume"
      level={volume}
      value={describeLevel(volume)}
      tint={tint}
      accessibilityLabel="Volume"
      hint="How loud the player's own output is. The phone's hardware volume multiplies it."
      onChange={TrackPlayerService.setVolume}
    />
  );
}
