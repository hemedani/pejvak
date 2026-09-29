import { readAsStringAsync } from "expo-file-system/legacy";

import { inspectAudioFile } from "@/services/AudioInspectionService";

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
}));

const readAsStringAsyncMock = jest.mocked(readAsStringAsync);

const OPTIONS = { fileName: "chapter one.mp3", fileSizeBytes: 9_600_000 };

/** Base64 of `ID3` — a plausible first three bytes, and nothing more is needed. */
const ID3_PREFIX = "SUQz";

/**
 * A stream is refused *before* the native module is reached.
 *
 * Asserting on the call rather than on the message is the whole point: the
 * native reader throws `IOException("Unsupported scheme for location …")` for an
 * `http(s)` URL, so a version that attempted the read and then reported the
 * failure would look correct from the outside while still spending a native
 * call, and still telling a retrying caller "not now" instead of "never".
 */
describe("inspectAudioFile", () => {
  beforeEach(() => {
    readAsStringAsyncMock.mockReset();
  });

  it.each([
    "https://cdn.manahej.ir/audio/1.mp3?md5=abc&expires=1700000000",
    "http://archive.org/download/item/track.mp3",
  ])("refuses the stream %s without reading it", async (uri) => {
    await expect(inspectAudioFile(uri, OPTIONS)).rejects.toThrow(/no file on this device/);

    expect(readAsStringAsyncMock).not.toHaveBeenCalled();
  });

  it("still reads a file on this device", async () => {
    readAsStringAsyncMock.mockResolvedValue(ID3_PREFIX);

    await inspectAudioFile("file:///data/user/0/audio/chapter%20one.mp3", OPTIONS);

    expect(readAsStringAsyncMock).toHaveBeenCalledWith(
      "file:///data/user/0/audio/chapter%20one.mp3",
      expect.objectContaining({ position: 0, encoding: "base64" }),
    );
  });

  it("still reads a SAF URI, which is a file even though it is not a path", async () => {
    readAsStringAsyncMock.mockResolvedValue(ID3_PREFIX);

    await inspectAudioFile(
      "content://com.android.externalstorage.documents/tree/primary%3AMusic",
      OPTIONS,
    );

    expect(readAsStringAsyncMock).toHaveBeenCalled();
  });
});
