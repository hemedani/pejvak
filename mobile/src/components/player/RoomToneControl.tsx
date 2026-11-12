/**
 * The background-tone row: a faint floor under the track, adjustable in one
 * gesture from the player itself, and made of whichever sound the listener
 * prefers.
 *
 * It sits on the player rather than behind a sheet because it is a *workaround*,
 * not a setting. A Bluetooth speaker that drops its link during silence loses
 * the word after the pause, and the listener discovers that mid-sentence — the
 * cure has to be reachable without leaving what they are listening to.
 *
 * The label is the audio world's own term for this: the noise a room already
 * has. "Add noise" would describe the mechanism; room tone describes why it is
 * there. The name on the row is the *tone's* name — Rain, Forest — because with
 * five of them the row has to say which one is running, and tapping it is the
 * shortest path to the other four.
 *
 * The level is selected here rather than passed down. A drag reports a dozen
 * values a second, and a prop would carry every one of them up through the route
 * and back down through the whole player — artwork, timeline, notes — to redraw
 * one caption. Subscribing in the leaf is the same rule the position tick
 * follows: the thing that changes every frame owns the change.
 */

import { useState } from "react";

import { LevelSliderRow } from "@/components/player/LevelSliderRow";
import { TONE_ICONS, TonePickerSheet } from "@/components/player/TonePickerSheet";
import { findTone, TONES } from "@/lib/ambientTones";
import { describeLevel } from "@/lib/audioEffects";
import * as AudioEffectsService from "@/services/AudioEffectsService";
import { useAudioEffectsStore } from "@/store/audioEffectsStore";

export type RoomToneControlProps = {
  /** Colour of the filled track — the track's own aurora accent. */
  tint: string;
};

export function RoomToneControl({ tint }: RoomToneControlProps) {
  const level = useAudioEffectsStore((state) => state.roomTone);
  const tone = useAudioEffectsStore((state) => state.tone);
  const [pickerOpen, setPickerOpen] = useState(false);

  const chosen = findTone(tone) ?? (TONES[0] as (typeof TONES)[number]);

  return (
    <>
      <LevelSliderRow
        icon={TONE_ICONS[chosen.id]}
        label={chosen.label}
        level={level}
        value={describeLevel(level)}
        tint={tint}
        accessibilityLabel={`Background tone, ${chosen.label}`}
        hint={`${chosen.hint} A faint floor under the audio, so Bluetooth speakers do not drop out during silence.`}
        onChange={AudioEffectsService.setRoomTone}
        onPressLabel={() => setPickerOpen(true)}
      />
      {pickerOpen ? (
        <TonePickerSheet tone={chosen.id} tint={tint} onClose={() => setPickerOpen(false)} />
      ) : null}
    </>
  );
}
