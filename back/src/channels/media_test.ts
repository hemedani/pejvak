import { equal, rejects } from "node:assert/strict";
import {
  listStoredFiles,
  selectReclaimablePaths,
  storeUploadFile,
  UPLOAD_ROOT,
  type UploadSource,
} from "./media.ts";

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
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
