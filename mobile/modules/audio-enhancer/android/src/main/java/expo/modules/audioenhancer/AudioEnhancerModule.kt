package expo.modules.audioenhancer

import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.ln

/**
 * The global output-mix session.
 *
 * `expo-audio` owns the ExoPlayer and never tells JavaScript its audio session
 * id, so an effect cannot be attached to *that* player's session from here.
 * Session `0` is the output mix every player's audio is folded into, which makes
 * it the one session reachable from outside the player — and the only reason
 * this module works at all. The consequence is honest and bounded: while the
 * enhancer is on, it shapes whatever this device is playing, not only Pejvak's
 * audio. It is attached when the listener enables it and released the moment
 * they disable it, stop playback, or leave.
 */
private const val OUTPUT_MIX_SESSION = 0

/**
 * A higher priority wins when two apps both attach an effect to the output mix.
 * The listener asked *this* app for a curve, so it takes precedence.
 */
private const val EFFECT_PRIORITY = 1

/** Below this the bass shelf is at full strength. */
private const val BASS_FULL_HZ = 120.0

/** Above this the bass shelf contributes nothing. */
private const val BASS_ZERO_HZ = 400.0

/** Below this the treble shelf contributes nothing. */
private const val TREBLE_ZERO_HZ = 2000.0

/** Above this the treble shelf is at full strength. */
private const val TREBLE_FULL_HZ = 8000.0

/**
 * A tone curve, applied to the device's own equalizer bands.
 *
 * Two things are deliberate:
 *
 *  · **The curve is a shelf, not a band.** A device may report five bands or ten,
 *    at frequencies this module cannot choose. Asking for "bass" therefore means
 *    "every band below 400 Hz, weighted by how low it sits", which lands the same
 *    way on a five-band phone equalizer as on a ten-band one.
 *  · **Every failure is caught.** `AudioEffect` throws a variety of unchecked
 *    exceptions — an OEM that refuses the output-mix session, a device whose
 *    effect chain is already claimed — and none of them are worth crashing a
 *    player over. A failure is reported to JavaScript as "unavailable", which
 *    the sheet turns into one sentence instead of a dead control.
 */
class AudioEnhancerModule : Module() {
  private var equalizer: Equalizer? = null
  private var loudness: LoudnessEnhancer? = null
  /** Centre frequency of each band, in Hz. Empty until attached. */
  private var bandFreqs = DoubleArray(0)
  private var minLevelMb = -1500
  private var maxLevelMb = 1500
  private var enabled = false
  private var boostMb = 0
  /** Last levels written, so a drag that changes nothing costs no binder calls. */
  private var appliedLevels: IntArray? = null

  override fun definition() = ModuleDefinition {
    Name("AudioEnhancer")

    /**
     * Creates the effects and reports what this device will allow. Safe to call
     * repeatedly; a second call while attached just reports the current state.
     */
    Function("attach") { attach() }

    /** Master switch. Leaves the curve intact so it can be restored. */
    Function("setEnabled") { value: Boolean -> setEnabled(value) }

    /** The curve, in dB. Applied whether or not the master switch is on. */
    Function("setGains") { boostDb: Double, bassDb: Double, trebleDb: Double ->
      applyGains(boostDb, bassDb, trebleDb)
    }

    /** Gives the output mix back to the system. */
    Function("detach") { detach() }

    OnDestroy { detach() }
  }

  private fun attach(): Map<String, Any?> {
    if (equalizer != null) {
      return status()
    }
    return try {
      val eq = Equalizer(EFFECT_PRIORITY, OUTPUT_MIX_SESSION)
      val range = eq.bandLevelRange
      minLevelMb = range[0].toInt()
      maxLevelMb = range[1].toInt()
      val count = eq.numberOfBands.toInt()
      bandFreqs = DoubleArray(count) { eq.getCenterFreq(it.toShort()) / 1000.0 }
      // Never arrive switched on: the listener enables it, and an effect that
      // starts by itself would shape the first second of their audio.
      eq.enabled = false
      equalizer = eq

      // Best-effort: some devices report an equalizer but refuse a loudness
      // enhancer on the output mix. Boost is then simply reported as absent
      // while bass and treble keep working.
      loudness = try {
        LoudnessEnhancer(OUTPUT_MIX_SESSION).also { it.enabled = false }
      } catch (_: Throwable) {
        null
      }
      status()
    } catch (error: Throwable) {
      detach()
      status(error.message ?: error.javaClass.simpleName)
    }
  }

  private fun status(reason: String? = null): Map<String, Any?> = mapOf(
    "available" to (equalizer != null),
    "reason" to reason,
    "bands" to bandFreqs.size,
    "boost" to (loudness != null)
  )

  private fun setEnabled(value: Boolean) {
    enabled = value
    try {
      equalizer?.enabled = value
    } catch (_: Throwable) {
      // An effect can be released under us by another app claiming the session.
    }
    applyLoudness()
  }

  private fun applyGains(boostDb: Double, bassDb: Double, trebleDb: Double) {
    boostMb = (boostDb.coerceAtLeast(0.0) * 100).toInt()

    val eq = equalizer
    if (eq != null) {
      val levels = IntArray(bandFreqs.size) { index ->
        val freq = bandFreqs[index]
        val db = bassDb * bassWeight(freq) + trebleDb * trebleWeight(freq)
        (db * 100).toInt().coerceIn(minLevelMb, maxLevelMb)
      }
      if (appliedLevels == null || !appliedLevels!!.contentEquals(levels)) {
        for (index in levels.indices) {
          try {
            eq.setBandLevel(index.toShort(), levels[index].toShort())
          } catch (_: Throwable) {
            // A band this device will not take must not abandon the others.
          }
        }
        appliedLevels = levels
      }
    }

    val enhancer = loudness
    if (enhancer != null) {
      try {
        enhancer.setTargetGain(boostMb)
      } catch (_: Throwable) {
        // Leave the previous gain rather than failing the whole curve.
      }
    }
    applyLoudness()
  }

  private fun applyLoudness() {
    val enhancer = loudness ?: return
    try {
      enhancer.enabled = enabled && boostMb > 0
    } catch (_: Throwable) {
      // Same as above: a released effect is not an error worth surfacing.
    }
  }

  private fun detach() {
    try {
      equalizer?.enabled = false
      equalizer?.release()
    } catch (_: Throwable) {
      // Already gone.
    }
    try {
      loudness?.enabled = false
      loudness?.release()
    } catch (_: Throwable) {
      // Already gone.
    }
    equalizer = null
    loudness = null
    bandFreqs = DoubleArray(0)
    appliedLevels = null
    enabled = false
    boostMb = 0
  }

  /** Full strength at or below [BASS_FULL_HZ], fading out by [BASS_ZERO_HZ]. */
  private fun bassWeight(freq: Double): Double {
    if (freq <= BASS_FULL_HZ) {
      return 1.0
    }
    if (freq >= BASS_ZERO_HZ) {
      return 0.0
    }
    // Log-spaced, because pitch is: a linear taper would put the whole shelf on
    // the lowest band and leave the next one untouched.
    return ln(BASS_ZERO_HZ / freq) / ln(BASS_ZERO_HZ / BASS_FULL_HZ)
  }

  /** Nothing below [TREBLE_ZERO_HZ], full strength at [TREBLE_FULL_HZ]. */
  private fun trebleWeight(freq: Double): Double {
    if (freq <= TREBLE_ZERO_HZ) {
      return 0.0
    }
    if (freq >= TREBLE_FULL_HZ) {
      return 1.0
    }
    return ln(freq / TREBLE_ZERO_HZ) / ln(TREBLE_FULL_HZ / TREBLE_ZERO_HZ)
  }
}
