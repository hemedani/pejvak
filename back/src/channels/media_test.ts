import { equal, rejects } from "node:assert/strict";
import {
  listStoredFiles,
  selectReclaimablePaths,
  storeUploadFile,
  UPLOAD_ROOT,
  type UploadSource,
  WAVEFORM_MIN_HEIGHT,
  WAVEFORM_PEAKS,
  waveformPeaks,
} from "./media.ts";

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
};

const generateWav = async (
  path: string,
  filter: string,
  durationSec?: number,
): Promise<void> => {
  const args = ["-v", "error", "-f", "lavfi", "-i", filter];
  if (durationSec !== undefined) args.push("-t", String(durationSec));
  args.push("-ac", "1", "-ar", "8000", "-y", path);

  const output = await new Deno.Command("ffmpeg", {
    args,
    stdout: "null",
    stderr: "piped",
  }).output();

  if (!output.success) {
    throw new Error(
      `ffmpeg could not create ${path}: ${
        new TextDecoder().decode(output.stderr).trim()
      }`,
    );
  }
};

const withTempDir = async (run: (dir: string) => Promise<void>) => {
  const dir = await Deno.makeTempDir({ prefix: "pejvak-waveform-" });
  try {
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {
      // Best-effort cleanup; the temp dir is disposable either way.
    });
  }
};

const removeMatching = async (dir: string, prefix: string) => {
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.startsWith(prefix)) {
        await Deno.remove(`${dir}/${entry.name}`);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
};

Deno.test("storeUploadFile renames the completed file and leaves no .part leaf", async () => {
  const id = `test-${crypto.randomUUID()}`;
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const source: UploadSource = {
    name: "episode.mp3",
    type: "audio/mpeg",
    size: bytes.byteLength,
    stream: () => new Blob([bytes]).stream(),
  };

  try {
    const stored = await storeUploadFile("audio", source, id);

    equal(stored.fileSizeBytes, bytes.byteLength);
    equal(await exists(`${UPLOAD_ROOT}/${stored.mediaPath}.part`), false);
    equal(await exists(`${UPLOAD_ROOT}/${stored.mediaPath}`), true);
  } finally {
    await removeMatching(`${UPLOAD_ROOT}/channel/audio`, `${id}-`);
  }
});

Deno.test("storeUploadFile leaves no bytes when the stream aborts", async () => {
  const id = `aborted-${crypto.randomUUID()}`;
  const source: UploadSource = {
    name: "broken.mp3",
    type: "audio/mpeg",
    size: 10,
    stream: () => {
      let sent = false;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(new Uint8Array([1, 2, 3]));
            return;
          }
          controller.error(new Error("client aborted"));
        },
      });
    },
  };

  try {
    await rejects(() => storeUploadFile("audio", source, id));
    equal(await exists(`${UPLOAD_ROOT}/channel/audio/${id}-broken.mp3`), false);
    equal(
      await exists(`${UPLOAD_ROOT}/channel/audio/${id}-broken.mp3.part`),
      false,
    );
  } finally {
    await removeMatching(`${UPLOAD_ROOT}/channel/audio`, `${id}-`);
  }
});

Deno.test("storeUploadFile refuses a short stream that ends without error", async () => {
  const id = `short-${crypto.randomUUID()}`;
  const source: UploadSource = {
    name: "short.mp3",
    type: "audio/mpeg",
    size: 10,
    stream: () => new Blob([new Uint8Array([1, 2, 3])]).stream(),
  };

  try {
    await rejects(() => storeUploadFile("audio", source, id));
    equal(await exists(`${UPLOAD_ROOT}/channel/audio/${id}-short.mp3`), false);
    equal(
      await exists(`${UPLOAD_ROOT}/channel/audio/${id}-short.mp3.part`),
      false,
    );
  } finally {
    await removeMatching(`${UPLOAD_ROOT}/channel/audio`, `${id}-`);
  }
});

Deno.test("selectReclaimablePaths reclaims only stale parts and unreferenced files", () => {
  const now = 10_000_000;
  const staleAfterMs = 1_000;
  const files = [
    { mediaPath: "channel/audio/stale.mp3.part", modifiedAtMs: now - 2_000 },
    { mediaPath: "channel/audio/fresh.mp3.part", modifiedAtMs: now - 10 },
    { mediaPath: "channel/audio/orphan.mp3", modifiedAtMs: now - 2_000 },
    { mediaPath: "channel/audio/kept.mp3", modifiedAtMs: now - 2_000 },
    { mediaPath: "channel/audio/legit.part", modifiedAtMs: now - 2_000 },
    { mediaPath: "channel/audio/new-orphan.mp3", modifiedAtMs: now - 10 },
  ];

  const { parts, orphans } = selectReclaimablePaths(
    files,
    new Set(["channel/audio/kept.mp3", "channel/audio/legit.part"]),
    now,
    staleAfterMs,
  );

  equal(parts.includes("channel/audio/stale.mp3.part"), true);
  equal(parts.includes("channel/audio/fresh.mp3.part"), false);
  equal(orphans.includes("channel/audio/orphan.mp3"), true);
  equal(orphans.includes("channel/audio/kept.mp3"), false);
  equal(orphans.includes("channel/audio/new-orphan.mp3"), false);
  equal(parts.includes("channel/audio/orphan.mp3"), false);
  // A published file whose name happens to end in `.part` is authoritative:
  // the row references it, so the sweep must never treat it as a temp leaf.
  equal(parts.includes("channel/audio/legit.part"), false);
  equal(orphans.includes("channel/audio/legit.part"), false);
});

Deno.test("waveformPeaks maps a sine to 160 finite heights above the floor", async () => {
  await withTempDir(async (dir) => {
    const path = `${dir}/sine.wav`;
    await generateWav(path, "aevalsrc=0.5*sin(2*PI*440*t):s=8000:d=2");

    const peaks = await waveformPeaks(path);

    equal(peaks.length, WAVEFORM_PEAKS);
    for (const peak of peaks) {
      equal(Number.isFinite(peak), true);
      equal(peak >= WAVEFORM_MIN_HEIGHT, true);
      equal(peak <= 1, true);
    }

    const mean = peaks.reduce((sum, peak) => sum + peak, 0) / peaks.length;
    equal(mean > WAVEFORM_MIN_HEIGHT + 0.2, true);
  });
});

Deno.test("waveformPeaks maps digital silence to the minimum height", async () => {
  await withTempDir(async (dir) => {
    const path = `${dir}/silence.wav`;
    await generateWav(path, "anullsrc=r=8000:cl=mono", 2);

    const peaks = await waveformPeaks(path);

    equal(peaks.length, WAVEFORM_PEAKS);
    for (const peak of peaks) {
      equal(Math.abs(peak - WAVEFORM_MIN_HEIGHT) < 1e-9, true);
    }
  });
});

Deno.test("waveformPeaks returns [] for a missing path or a non-audio file", async () => {
  await withTempDir(async (dir) => {
    equal((await waveformPeaks(`${dir}/missing.wav`)).length, 0);

    const text = `${dir}/not-audio.txt`;
    await Deno.writeTextFile(text, "this is not audio");
    equal((await waveformPeaks(text)).length, 0);
  });
});

Deno.test("waveformPeaks returns [] when there are fewer samples than buckets", async () => {
  await withTempDir(async (dir) => {
    const path = `${dir}/too-short.wav`;
    await generateWav(path, "anullsrc=r=8000:cl=mono", 0.01);

    equal((await waveformPeaks(path)).length, 0);
  });
});

Deno.test("listStoredFiles returns media paths relative to the upload root", async () => {
  const id = `listed-${crypto.randomUUID()}`;
  const source: UploadSource = {
    name: "listed.mp3",
    type: "audio/mpeg",
    size: 2,
    stream: () => new Blob([new Uint8Array([7, 8])]).stream(),
  };

  try {
    const stored = await storeUploadFile("audio", source, id);
    const files = await listStoredFiles();
    equal(files.some((file) => file.mediaPath === stored.mediaPath), true);
  } finally {
    await removeMatching(`${UPLOAD_ROOT}/channel/audio`, `${id}-`);
  }
});
