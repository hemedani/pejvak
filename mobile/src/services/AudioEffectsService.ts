/**
 * The audio treatments' engine.
 *
 * Two unrelated mechanisms sit behind one service because the listener thinks of
 * them as one thing — "make this recording listenable" — and because both have
 * to follow playback: neither may run while the player is stopped.
 *
 *   · **The enhancer** is native (`modules/audio-enhancer`). It is attached to
 *     the output mix, given a curve, and released the moment it is switched off,
 *     so it never colours audio the listener did not ask it to colour.
 *   · **The room tone** is a second, looping `expo-audio` player holding a
 *     generated noise file at a very low volume. Android mixes the two players
 *     into one output stream, so the stream never reaches digital silence — which
 *     is exactly the condition that makes a Bluetooth sink drop its link and eat
 *     the first words after a pause.
 *
 * Both are device preferences, persisted locally and never synced. Nothing here
 * can throw into a caller: a device that refuses the effect, a cache the system
 * reclaimed, a missing native module — each degrades to "this control does
 * nothing" and leaves playback untouched.
 */

import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";

import AudioEnhancer from "../../modules/audio-enhancer";
import {
  DEFAULT_TONE_ID,
  buildToneWav,
  parseToneId,
  toneFileName,
  type AmbientToneId,
} from "@/lib/ambientTones";
import {
  DEFAULT_ENHANCER,
  normalizeRoomTone,
  parseEnhancer,
  patchEnhancer,
  roomToneAmplitude,
  serializeEnhancer,
  type AudioEnhancerSettings,
} from "@/lib/audioEffects";
import { LocalDBService } from "@/services/LocalDBService";
import { useAudioEffectsStore, type AudioEffectsPatch } from "@/store/audioEffectsStore";

const SETTING_ENHANCER = "audioEnhancer";
const SETTING_ROOM_TONE = "roomTone";
const SETTING_TONE = "ambientTone";

/**
 * The level a tone is turned on at when the listener picks one while the slider
 * is at zero.
 *
 * Choosing a tone is asking for it to be heard, and a control that changes its
 * own name and produces no sound reads as broken — the same rule the enhancer
 * follows when a band is moved. Kept low: the tone is a floor, not a track.
 */
const DEFAULT_TONE_LEVEL = 35;

/**
 * Sliders report every pixel of a drag. Writing the setting that often would be
 * a hundred database writes per gesture, so writes are coalesced and the audio
 * is not: the effect and the player volume change immediately.
 */
const PERSIST_DELAY_MS = 400;

let enhancer: AudioEnhancerSettings = DEFAULT_ENHANCER;
let roomTone = 0;
let tone: AmbientToneId = DEFAULT_TONE_ID;
let loaded: Promise<void> | null = null;

let attached = false;
let attachReason: string | null = null;

let noise: AudioPlayer | null = null;
let noiseUri: string | null = null;
/** Whether the main player is currently producing audio. */
let playbackActive = false;

const pendingWrites = new Map<string, string>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function patch(partial: AudioEffectsPatch): void {
  useAudioEffectsStore.getState().patch(partial);
}

function scheduleWrite(key: string, value: string): void {
  pendingWrites.set(key, value);
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(flushWrites, PERSIST_DELAY_MS);
}

function flushWrites(): void {
  persistTimer = null;
  const rows = [...pendingWrites.entries()];
  pendingWrites.clear();
  for (const [key, value] of rows) {
    void LocalDBService.setSetting(key, value).catch(() => undefined);
  }
}

/**
 * Reads the stored preferences. Called once at launch.
 *
 * Deliberately does not attach the enhancer: an effect on the output mix shapes
 * whatever the device is playing, and applying one at startup — before the
 * listener has played anything — would colour another app's audio.
 */
export function load(): Promise<void> {
  loaded ??= (async () => {
    const [storedEnhancer, storedRoomTone, storedTone] = await Promise.all([
      LocalDBService.getSetting(SETTING_ENHANCER).catch(() => null),
      LocalDBService.getSetting(SETTING_ROOM_TONE).catch(() => null),
      LocalDBService.getSetting(SETTING_TONE).catch(() => null),
    ]);
    enhancer = parseEnhancer(storedEnhancer);
    roomTone = normalizeRoomTone(storedRoomTone);
    tone = parseToneId(storedTone);
    patch({ enhancer, roomTone, tone });
    // Audio can already be playing if the read lost the race with a tap on the
    // mini-player. Without this the stored settings would sit unused until the
    // next track.
    if (playbackActive) {
      if (enhancer.enabled) {
        applyEnhancer();
      }
      void applyRoomTone();
    }
  })().catch(() => {
    // The defaults in the store are already correct; a failed read is not worth
    // a message. Retrying would only repeat it.
  });
  return loaded;
}

/**
 * Changes the curve. Moving a band implies "on" (see `patchEnhancer`), so the
 * first drag is audible without a switch being found first.
 */
export function setEnhancer(values: Partial<AudioEnhancerSettings>): void {
  enhancer = patchEnhancer(enhancer, values);
  patch({ enhancer });
  applyEnhancer();
  scheduleWrite(SETTING_ENHANCER, serializeEnhancer(enhancer));
}

/**
 * Asks the device whether the enhancer is usable, without switching it on.
 *
 * The sheet calls this when it opens, because "not known yet" and "this device
 * cannot" are different sentences and the controls must not offer a slider that
 * does nothing. Attaching an effect that is not enabled is inaudible, so asking
 * early costs nothing.
 */
export function probe(): void {
  const available = ensureAttached();
  if (available && !enhancer.enabled) {
    try {
      AudioEnhancer?.setEnabled(false);
    } catch {
      // Released between the attach and the call; the next change retries.
    }
  }
}

/** Sets the room tone, 0–100, and starts or stops the noise player to match. */
export function setRoomTone(percent: number): void {
  const next = normalizeRoomTone(percent);
  if (next === roomTone) {
    return;
  }
  roomTone = next;
  patch({ roomTone });
  scheduleWrite(SETTING_ROOM_TONE, String(roomTone));
  void applyRoomTone();
}

/**
 * Chooses which sound the noise floor is made of.
 *
 * The player is re-pointed at the new file rather than rebuilt, and it keeps
 * playing: the tone is a floor under something else, and a gap while a name
 * changes would be the one moment the sink hears silence. Picking a tone while
 * the level is at zero turns it on at `DEFAULT_TONE_LEVEL`, because a choice
 * that produces nothing is indistinguishable from a broken control.
 */
export function setTone(id: AmbientToneId): void {
  const next = parseToneId(id);
  if (next === tone) {
    return;
  }
  tone = next;
  patch({ tone });
  scheduleWrite(SETTING_TONE, tone);
  if (roomTone === 0) {
    roomTone = DEFAULT_TONE_LEVEL;
    patch({ roomTone });
    scheduleWrite(SETTING_ROOM_TONE, String(roomTone));
  }
  void applyRoomTone();
}

/**
 * Follows the transport. Called by `TrackPlayerService` on every state change;
 * idempotent, so the status tick may call it freely.
 *
 * The noise player is paused rather than released while paused: a pause is
 * usually momentary, and recreating a player on resume would delay the very
 * thing the room tone exists to keep alive.
 */
export function syncPlayback(playing: boolean): void {
  if (playing === playbackActive) {
    return;
  }
  playbackActive = playing;
  if (playing) {
    // A curve survives a stop, but the effect itself was released with it.
    if (enhancer.enabled) {
      applyEnhancer();
    }
    void applyRoomTone();
    return;
  }
  noise?.pause();
}

/**
 * Gives everything back: the effect to the system, the noise player to memory.
 *
 * Called when the listener stops the player outright, not when they pause —
 * a pause still owns the audio session.
 */
export function release(): void {
  playbackActive = false;
  detachEnhancer();
  releaseNoise();
}

function applyEnhancer(): void {
  if (!enhancer.enabled) {
    detachEnhancer();
    return;
  }
  if (!ensureAttached()) {
    return;
  }
  // Curve first, switch second: enabling an effect still holding the previous
  // listener's bands would make the first moment of audio wrong.
  try {
    AudioEnhancer?.setGains(enhancer.boostDb, enhancer.bassDb, enhancer.trebleDb);
    AudioEnhancer?.setEnabled(true);
  } catch {
    // The effect can be released by the system at any time; the next change
    // re-attaches.
    detachEnhancer();
  }
}

function ensureAttached(): boolean {
  if (attached) {
    return true;
  }
  if (!AudioEnhancer) {
    reportUnavailable(
      "This build has no audio effects module. The enhancer needs a development or production build.",
    );
    return false;
  }
  try {
    const result = AudioEnhancer.attach();
    attached = result.available;
    attachReason = result.available ? null : (result.reason ?? "This device refused the audio effect.");
  } catch (error) {
    attached = false;
    attachReason = error instanceof Error ? error.message : "The audio effect could not start.";
  }
  const current = useAudioEffectsStore.getState();
  if (current.enhancerAvailable !== attached || current.enhancerReason !== attachReason) {
    patch({ enhancerAvailable: attached, enhancerReason: attachReason });
  }
  return attached;
}

function detachEnhancer(): void {
  if (attached) {
    try {
      AudioEnhancer?.detach();
    } catch {
      // Already gone.
    }
  }
  attached = false;
  attachReason = null;
}

function reportUnavailable(reason: string): void {
  attachReason = reason;
  if (useAudioEffectsStore.getState().enhancerReason !== reason) {
    patch({ enhancerAvailable: false, enhancerReason: reason });
  }
}

async function applyRoomTone(): Promise<void> {
  if (roomTone <= 0) {
    noise?.pause();
    return;
  }
  const player = ensureNoisePlayer();
  if (!player) {
    return;
  }
  player.volume = roomToneAmplitude(roomTone);
  if (playbackActive && !player.playing) {
    player.play();
  }
}

/**
 * The noise player, created on first use and kept until the level returns to
 * zero. A `null` return means this device could not provide the file, and the
 * slider will simply do nothing — which is the right failure for a workaround
 * nobody should have to think about.
 *
 * A change of tone re-points the same player rather than building a second one:
 * the old file is released with the old URI, and nothing else about the player
 * changes.
 */
function ensureNoisePlayer(): AudioPlayer | null {
  const uri = ensureNoiseFile(tone);
  if (!uri) {
    return null;
  }
  try {
    const player = noise ?? createAudioPlayer(null, { updateInterval: 5000 });
    player.loop = true;
    if (uri !== noiseUri) {
      player.replace({ uri });
      noiseUri = uri;
    }
    player.volume = roomToneAmplitude(roomTone);
    noise = player;
    return player;
  } catch {
    return null;
  }
}

function releaseNoise(): void {
  noise?.pause();
  const instance = noise;
  noise = null;
  noiseUri = null;
  instance?.release();
}

/**
 * Writes a tone's file into the cache if it is not there.
 *
 * The cache is the right home: the bytes are regenerable, and a system that
 * reclaims them costs one regeneration rather than an error. Each tone has its
 * own name, so switching back and forth costs one write per tone, ever.
 */
function ensureNoiseFile(id: AmbientToneId): string | null {
  try {
    const file = new File(Paths.cache, toneFileName(id));
    if (file.exists) {
      return file.uri;
    }
    file.create();
    file.write(buildToneWav(id));
    return file.uri;
  } catch {
    return null;
  }
}

/** Test-only: forgets the engine so a case cannot inherit the previous one's. */
export function __resetForTests(): void {
  enhancer = DEFAULT_ENHANCER;
  roomTone = 0;
  tone = DEFAULT_TONE_ID;
  loaded = null;
  attached = false;
  attachReason = null;
  noise = null;
  noiseUri = null;
  playbackActive = false;
  pendingWrites.clear();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  useAudioEffectsStore.getState().reset();
}
