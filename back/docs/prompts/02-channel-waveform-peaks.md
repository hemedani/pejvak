# Prompt 02 — Channel Waveform Peaks (backend brief)

Append-only. Sector: `back/`. Related: [`01-listener-channels.md`](./01-listener-channels.md).
Android consumer already shipped: [`../../android/docs/plans/08-channels-discovery-ux.md`](../../android/docs/plans/08-channels-discovery-ux.md).

## Original brief (owner's words, condensed)

> "The progress bar audio visualizer is not worked too. I like to have a **real** audio visualizer, not a
> fake one, for channels audios. If we should do anything in backend please add an enhanced prompt here."

## Why this is a backend job

The player's scrubber draws the bar strip behind the progress bar from a track's measured loudness
(`WAVEFORM_BUCKETS = 84` RMS windows, stored as 0..1 heights). On Android the measurement is done by
decoding the local file. A **channel episode is streamed**, so there is no local file to decode; today the
app falls back to a deterministic *sample* strip (`sampleWaveformFor`). That is the "fake" visualizer the
owner is rejecting.

We host the bytes (`uploadChannelMedia` → `./uploads`, served at `/uploads`), so the server is the one place
that can measure every episode **once**, at publish time, and hand the strip to every listener. Doing it on
the device over HTTP would mean dozens of range seeks per episode and a codec on every play; doing it here
is one decode on one machine.

The Android side is already wired to consume the field: `ChannelAudio.waveform` is parsed from the wire,
resampled with `wireWaveform(...)`, and handed to `WaveformAnalyzer.provide(...)` when the episode is
materialised for playback. **Until this backend ships, the client falls back to the sample strip, so the
field is forward-compatible and safe to add.**

## Contract (must match exactly)

Add to `back/models/channelAudio.ts` (`channelAudio_pure`):

```ts
/**
 * Measured loudness strip for the scrubber: exactly WAVEFORM_PEAKS heights in
 * [0, 1], left→right, produced once from the hosted bytes. Empty when the server
 * could not measure the file; the client then falls back to its sample strip.
 * Never accepted from the client — `publishChannelAudio` computes it.
 */
waveform: defaulted(array(number()), []),
```

Rules:

- **Exactly `WAVEFORM_PEAKS = 160` values** when non-empty. (The client resamples 160 → its 84 buckets,
  keeping peaks, and clamps to `[0.12, 1]`. More source buckets than bars is intentional.)
- **Values are heights, not raw amplitude.** Use the *same* mapping the client uses so a server strip and a
  device strip look identical:
  - `MIN_HEIGHT = 0.12` (silence floor), `FLOOR_DB = -52`, `CEIL_DB = -6`.
  - `rms = sqrt(mean(sample²))` over the bucket, samples normalised to `[-1, 1]`.
  - `db = 20 * log10(max(rms, 1e-6))`.
  - `height = MIN_HEIGHT + (1 - MIN_HEIGHT) * clamp((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB), 0, 1)`.
  - `rms <= 0` (digital silence) → `MIN_HEIGHT`.
- **Finite only.** Clamp before storing; never persist `NaN`/`Infinity` (JSON would turn them into `null`).
- **Immutable after publish.** `updateChannelAudio` must not change it (it changes metadata only); a
  re-upload is a new row.

## Where to compute

`publishChannelAudio` — **server-authoritative**, from the file on disk. Do **not** trust a client-sent
waveform (the same reason `channel` is derived from the folder, prompt 01/D8).

`src/channels/publishChannelAudio/publishChannelAudio.fn.ts` already receives `set.mediaPath` (optional) and
the upload root is `UPLOAD_ROOT` from `src/channels/media.ts`:

```ts
const absolute = set.mediaPath
  ? `${UPLOAD_ROOT}/${set.mediaPath}`
  : undefined;
const waveform = absolute ? await waveformPeaks(absolute) : [];
```

Store `waveform` on the created `channelAudio` row. If `mediaPath` is absent, or the file is missing, or
`ffmpeg` fails: store `[]`, log once, and **let the publish succeed**. A waveform is a nicety; losing it must
never lose the episode.

Do **not** add `waveform` to the publish validator's `set`. The act computes it.

## The measurement helper (`src/channels/media.ts`)

Add one pure-ish, testable function. Suggested shape:

```ts
export const WAVEFORM_PEAKS = 160;

/** Heights in [0,1] for [path], or [] when the file cannot be measured. */
export const waveformPeaks = async (
  path: string,
  buckets = WAVEFORM_PEAKS,
): Promise<number[]> => { /* ... */ };
```

Implementation notes:

- Use `Deno.Command("ffmpeg", { args: [...] , stdout: "piped", stderr: "piped" })` — **no shell string**,
  no filename interpolation into a command line.
- Decode to mono 16-bit little-endian PCM at a low rate — enough to measure loudness, cheap to parse:
  `-v error -i <path> -ac 1 -ar 8000 -f s16le -`.
- `await command.output()`. On `!output.success`, return `[]` (do not throw). `stderr` is for the log.
- Read `output.stdout` as `Int16Array` (watch alignment: copy into a new `ArrayBuffer` if
  `byteOffset % 2 !== 0`; `DataView.getInt16(i, true)` is the safe fallback).
- Split the sample count into `buckets` equal spans (integer boundaries; the last span absorbs the
  remainder). For each span accumulate `sum += (s / 32768)²` and count, then map with the dB formula above.
- A span with zero samples → `MIN_HEIGHT`. An empty/short file → `[]` if `samples < buckets` (too little to
  measure honestly), otherwise measure what is there.
- Keep the decode bounded: a very long audiobook is fine (streaming stdout), but cap parsing at a sane
  maximum (e.g. stop after a few minutes of audio) **only if** it does not change the shape; document the
  choice. The whole file is acceptable for v1 because it is one CPU-bound pass at publish time.

`ffmpeg` is a **runtime dependency of the backend**, not just a dev tool:

- `Dockerfile`: install `ffmpeg` in the image (Debian/Ubuntu: `apt-get install -y --no-install-recommends
  ffmpeg`; Alpine: `apk add --no-cache ffmpeg`) and keep the layer slim; confirm the `ffprobe` binary is
  present too if used.
- Document it in `back/README`/env notes so a fresh machine is not a mystery: "publishing an episode measures
  it with `ffmpeg`; without it, episodes still publish but carry an empty `waveform`."

## Backfill (existing episodes)

Rows uploaded before this change have no `waveform`. Add a one-shot, idempotent task:

- `back/src/channels/backfillWaveforms.ts`, registered in `back/deno.json` as
  `"backfill:waveforms": "deno run -A src/channels/backfillWaveforms.ts"`.
- Page `channelAudio` where `mediaPath` is set and `waveform` is missing/empty/short; compute from
  `${UPLOAD_ROOT}/${mediaPath}`; update in place with `updatedAt` untouched beyond the write (do not bump
  user-visible timestamps unnecessarily — use the ODM's setter, not a fake edit).
- Skip a missing file with a counted reason, keep going, and print a final
  `{scanned, updated, skippedMissing, failed}` summary. Re-running is a no-op for filled rows.
- Do not delete or fail rows whose bytes are gone; they simply keep `[]`.

## Reads / projections

`listChannelAudios` and `getChannelAudio` already return pure fields through `projectionOrPure`, so the new
field is projectable with no act change. The Android client's `audioProjection` already requests `"waveform"`.

**Payload note (accepted for v1):** 160 floats ≈ 1–2 KB per row; a 200-row page grows by a few hundred KB.
That is acceptable on Wi-Fi and keeps playback offline. If it becomes a problem, move `waveform` out of the
list projection into `getChannelAudio` only (the client would fetch it when an episode is played). Record
that as **CH-WAVE-LAZY**; do not silently drop the field from reads.

## Acceptance criteria

1. **Unit** — `src/channels/media_test.ts` (or a sibling) for `waveformPeaks`:
   - a generated 2 s sine at ~0.5 full scale → 160 values, all in `[0.12, 1]`, mean well above the floor;
   - a generated silent WAV (or `/dev/zero` encoded) → 160 values all ≈ `0.12`;
   - a missing path / non-audio file → `[]`, no throw;
   - output length is exactly 160 and every value is finite.
   Keep the fixtures generated in the test (ffmpeg in CI), not committed.
2. **Publish** — `back/channels.hurl` (or the channels suite): publish an episode with `mediaPath`, then
   `getChannelAudio` returns a `waveform` array of length 160; a follow-up `updateChannelAudio` leaves it
   unchanged.
3. **Resilience** — simulating ffmpeg failure (bad path / `PATH` without ffmpeg) still publishes the row with
   `waveform: []` and does not 500.
4. **Backfill** — run the task once over a seeded DB: it fills every row with bytes and is a no-op on a
   second run.
5. **Android** — with this deployed, open a channel and play a **streamed** episode (not downloaded): the
   scrubber's bars track the audio (loud passage near the top, silence on the floor) instead of the seeded
   sample. With the field absent, the sample still renders.
6. **Gates** — `deno check mod.ts`, `deno lint`, `deno fmt --check`, the channels hurl suite, and regenerated
   `declarations/` committed in their own commit (a declaration change is a breaking change for `front/` and
   `mobile/`; refresh their vendored copies byte-for-byte).

## Non-negotiables carried from AGENTS

- Strict TypeScript, no `any`; one model per file; validator before implementation; `get` stays a closed
  allow-list.
- `contentHash` remains the identity; `durationSec` remains a **device fact** — do not overwrite it from
  ffprobe here (a future CH-DUR task may reconcile it; do not fold it into this one).
- Never fail or delete a published episode because measurement failed. Skip-and-report, never destroy.
- Regenerating `declarations/` is a breaking change for `front/` and `mobile/`.
- Backend work is done only when `deno check mod.ts`, `deno lint`, `deno fmt --check` pass and the act's hurl
  steps are green.
