/**
 * The two audio treatments the player offers, as data.
 *
 * Both exist for the same listener problem — a recording that is hard to hear —
 * but they fix opposite halves of it:
 *
 *   · **The enhancer** shapes what comes out of the speaker: more level, more
 *     low end, more presence. It is a set of numbers the native effects unit
 *     turns into band gains, and it belongs to the device (a phone speaker and a
 *     pair of headphones want different curves).
 *   · **Room tone** adds a whisper of noise underneath the audio. Nothing about
 *     it is musical: a Bluetooth sink that hears digital silence long enough
 *     powers down its link, and the word after the pause is lost while it comes
 *     back. A floor of noise that never stops is the cure.
 *
 * Everything here is pure so the ranges, the wording and the persisted format
 * can be tested without an audio engine, a device, or a rendered screen.
 */

/**
 * A tone control's travel, in decibels.
 *
 * ±12 dB is the widest range an Android `Equalizer` band can usually express
 * (its own limit is reported per device, commonly ±15 dB) and already more than
 * a listener needs to rescue a badly recorded lecture; going wider mostly buys
 * distortion. Boost is one-sided on purpose — "quieter than the file" is the
 * system volume's job, and a negative gain would compete with it.
 */
export const ENHANCER_RANGE = {
  boostDb: { min: 0, max: 12, step: 0.5 },
  bassDb: { min: -12, max: 12, step: 0.5 },
  trebleDb: { min: -12, max: 12, step: 0.5 },
} as const;

export type EnhancerBand = keyof typeof ENHANCER_RANGE;

export type AudioEnhancerSettings = {
  /**
   * Whether the curve is applied at all.
   *
   * Separate from the gains so a listener can switch their curve off for one
   * track and back on for the next without losing it. Moving any slider turns
   * it on, because a control that changes a number and nothing audible reads as
   * broken.
   */
  enabled: boolean;
  /** Extra level, in dB. 0 is off — the file as recorded. */
  boostDb: number;
  bassDb: number;
  trebleDb: number;
};

export const DEFAULT_ENHANCER: AudioEnhancerSettings = {
  enabled: false,
  boostDb: 0,
  bassDb: 0,
  trebleDb: 0,
};

/** Whether the curve is doing anything, regardless of the switch. */
export function isEnhancerFlat(settings: AudioEnhancerSettings): boolean {
  return settings.boostDb === 0 && settings.bassDb === 0 && settings.trebleDb === 0;
}

/**
 * Whether the enhancer is on *and* changing the sound.
 *
 * What a chip's "selected" state means: a switch that is on with a flat curve
 * is on in name only, and marking it would tell the listener their audio is
 * being shaped when nothing is.
 */
export function isEnhancerActive(settings: AudioEnhancerSettings): boolean {
  return settings.enabled && !isEnhancerFlat(settings);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Snaps to the band's step, so a drag cannot store 3.4999 dB. */
function quantize(value: number, band: EnhancerBand): number {
  const { min, max, step } = ENHANCER_RANGE[band];
  const snapped = Math.round(value / step) * step;
  // Floating-point multiplication reintroduces the noise the round removed.
  return clamp(Math.round(snapped * 10) / 10, min, max);
}

/**
 * Coerces anything — a stored string, a partially-filled patch, a value from a
 * slider that has not been snapped yet — into a usable curve.
 *
 * Each band falls back on its own, so one unreadable field cannot discard the
 * listener's other two.
 */
export function normalizeEnhancer(input: Partial<AudioEnhancerSettings>): AudioEnhancerSettings {
  return {
    enabled: input.enabled ?? DEFAULT_ENHANCER.enabled,
    boostDb: quantize(asFinite(input.boostDb, DEFAULT_ENHANCER.boostDb), "boostDb"),
    bassDb: quantize(asFinite(input.bassDb, DEFAULT_ENHANCER.bassDb), "bassDb"),
    trebleDb: quantize(asFinite(input.trebleDb, DEFAULT_ENHANCER.trebleDb), "trebleDb"),
  };
}

function asFinite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Applies a patch the way a control means it: moving a slider implies "on".
 *
 * Without this the sheet would need a switch flipped before any slider did
 * anything, and the first thing every listener does is drag one.
 */
export function patchEnhancer(
  current: AudioEnhancerSettings,
  patch: Partial<AudioEnhancerSettings>,
): AudioEnhancerSettings {
  const next = normalizeEnhancer({ ...current, ...patch });
  const movedABand =
    patch.boostDb !== undefined || patch.bassDb !== undefined || patch.trebleDb !== undefined;
  if (movedABand && patch.enabled === undefined) {
    return { ...next, enabled: true };
  }
  return next;
}

/** "+3.0 dB", "−4.5 dB", or "Off" — a signed figure, never a bare number. */
export function describeGainDb(value: number): string {
  if (value === 0) {
    return "Off";
  }
  // A true minus sign: the hyphen in a tabular figure is half the width of the
  // plus it has to balance.
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(1)} dB`;
}

/** The persisted form. One JSON object, so the three bands travel together. */
export function serializeEnhancer(settings: AudioEnhancerSettings): string {
  return JSON.stringify(settings);
}

/**
 * Reads a stored curve, falling back on the default for anything unusable.
 *
 * A parse failure is not an error worth surfacing: the listener loses a tone
 * curve, not their library.
 */
export function parseEnhancer(raw: string | null): AudioEnhancerSettings {
  if (!raw) {
    return DEFAULT_ENHANCER;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_ENHANCER;
    }
    const record = parsed as Record<string, unknown>;
    return normalizeEnhancer({
      enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
      boostDb: typeof record.boostDb === "number" ? record.boostDb : undefined,
      bassDb: typeof record.bassDb === "number" ? record.bassDb : undefined,
      trebleDb: typeof record.trebleDb === "number" ? record.trebleDb : undefined,
    });
  } catch {
    return DEFAULT_ENHANCER;
  }
}

/** The room-tone slider is 0–100; 0 is the only "off". */
export const ROOM_TONE_MAX = 100;

/**
 * The level the noise is played at, as a linear amplitude for `player.volume`.
 *
 * Mapped in decibels rather than as a percentage of full scale, because that is
 * how the ear works: a linear slider would spend its first half inaudible and
 * its second half far too loud. The floor sits at −55 dBFS — still thousands of
 * times above the digital silence that drops a Bluetooth link, and quiet enough
 * to disappear under a recording — and the ceiling at −15 dBFS, which is
 * audible but never competes with speech.
 */
export function roomToneAmplitude(percent: number): number {
  const clamped = clamp(asFinite(percent, 0), 0, ROOM_TONE_MAX);
  if (clamped === 0) {
    return 0;
  }
  const db = -55 + (clamped / ROOM_TONE_MAX) * 40;
  return 10 ** (db / 20);
}

/** "Off" or "24%". */
export function describeRoomTone(percent: number): string {
  const clamped = Math.round(clamp(asFinite(percent, 0), 0, ROOM_TONE_MAX));
  return clamped === 0 ? "Off" : `${clamped}%`;
}

/** Coerces a stored or dragged value into 0–100 whole percent. */
export function normalizeRoomTone(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(clamp(parsed, 0, ROOM_TONE_MAX));
}
