/**
 * The geometry of the wavy progress bar.
 *
 * Both the shape and the amplitude rule live here — away from React and the
 * SVG layer — because they are the two things that are easy to get subtly
 * wrong: a wave that does not meet the centreline at its ends clips against the
 * thumb, and a wave whose phase keeps running while it is flat redraws the
 * screen forever for nothing.
 *
 * Distances are in density-independent points. The caller passes the bar's
 * measured width in points, so the wavelength looks the same on every density.
 */

export type WavePathOptions = {
  /** The full width of the bar, in points. */
  width: number;
  /** Vertical centre of the track, in points. */
  centerY: number;
  /** Maximum deviation from the centreline, in points. */
  amplitude: number;
  /** Distance between crests, in points. */
  wavelength: number;
  /** Phase in radians. Decreasing phase travels to the right. */
  phase: number;
  /** Where the wave starts. Defaults to 0. */
  startX?: number;
  /** Where the wave ends — the thumb's gap. Defaults to `width`. */
  endX?: number;
};

/** A hard cap on samples, so an unusually wide bar cannot unbounded the path. */
export const WAVE_MAX_SAMPLES = 180;

function smoothstep(t: number): number {
  "worklet";
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function rounded(n: number): number {
  "worklet";
  return Math.round(n * 100) / 100;
}

/**
 * Build an SVG path for the played segment.
 *
 * The amplitude is enveloped with a smoothstep at both ends: the first
 * wavelength eases in from the left edge and the last half-wavelength eases
 * out into the thumb's gap. That is what guarantees the stroke starts and ends
 * exactly on the centreline, so a round cap looks intentional and the wave
 * never reaches the thumb at a sharp angle.
 */
export function buildWavePath({
  width,
  centerY,
  amplitude,
  wavelength,
  phase,
  startX = 0,
  endX,
}: WavePathOptions): string {
  "worklet";
  const stop = Math.max(startX, endX ?? width);
  const length = stop - startX;
  const flat = `M ${rounded(startX)} ${rounded(centerY)} L ${rounded(stop)} ${rounded(centerY)}`;

  if (length <= 0 || amplitude <= 0 || wavelength <= 0) {
    return flat;
  }

  // Roughly a sample every 2–4 points, then stretched if the bar is so long
  // that it would blow past the cap.
  const step = Math.max(
    Math.min(4, Math.max(2, wavelength / 12)),
    length / WAVE_MAX_SAMPLES,
  );
  const cycle = (Math.PI * 2) / wavelength;
  const rampIn = Math.min(wavelength, length / 2);
  const rampOut = Math.min(wavelength / 2, length / 2);

  let path = `M ${rounded(startX)} ${rounded(centerY)}`;
  for (let x = startX + step; x < stop; x += step) {
    const envelope =
      smoothstep((x - startX) / rampIn) * smoothstep((stop - x) / rampOut);
    const y = centerY + Math.sin(cycle * (x - startX) + phase) * amplitude * envelope;
    path += ` L ${rounded(x)} ${rounded(y)}`;
  }
  path += ` L ${rounded(stop)} ${rounded(centerY)}`;
  return path;
}

/**
 * Whether the wave should be at full amplitude.
 *
 * This is the state machine, not an animation: the caller animates *toward*
 * this target and passes the final 0 or 1 to the drawing layer, never the
 * intermediate values, so a flat bar really is flat.
 */
export function waveAmplitudeTarget({
  motionEnabled,
  isPlaying,
  isScrubbing,
}: {
  motionEnabled: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
}): 0 | 1 {
  return motionEnabled && isPlaying && !isScrubbing ? 1 : 0;
}

/**
 * Phase change for a frame. Negative so the crests travel to the right.
 *
 * `periodMs` must default to a literal: a worklet's default parameters are
 * evaluated before the generated `this.__closure` lookup, so a module binding
 * there is a ReferenceError on the UI runtime.
 */
export function wavePhaseDelta(elapsedMs: number, periodMs = 1000): number {
  "worklet";
  if (periodMs <= 0) {
    return 0;
  }
  return -(elapsedMs / periodMs) * Math.PI * 2;
}
