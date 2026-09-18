import { getInfoAsync } from "expo-file-system/legacy";

import { isLocationReachable } from "@/services/FileLocationService";

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
}));

const getInfoAsyncMock = jest.mocked(getInfoAsync);

/** `FileInfo` is a discriminated union; these are the two arms the code reads. */
type Info = Awaited<ReturnType<typeof getInfoAsync>>;

function info(exists: boolean, uri: string): Info {
  return exists
    ? ({ exists: true, uri, size: 1_024, isDirectory: false, modificationTime: 0 } as Info)
    : ({ exists: false, uri, isDirectory: false } as Info);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isLocationReachable", () => {
  it("is reachable when the location resolves", async () => {
    getInfoAsyncMock.mockResolvedValue(info(true, "content://here"));

    expect(await isLocationReachable("content://here")).toBe(true);
  });

  it("is not reachable when the location is positively gone", async () => {
    // The documented contract: a missing item resolves to `exists: false`
    // rather than throwing. This is the answer that licenses a relink.
    getInfoAsyncMock.mockResolvedValue(info(false, "content://gone"));

    expect(await isLocationReachable("content://gone")).toBe(false);
  });

  it("is not reachable when there is no location at all", async () => {
    expect(await isLocationReachable(null)).toBe(false);
    expect(await isLocationReachable(undefined)).toBe(false);
    expect(await isLocationReachable("")).toBe(false);
    expect(getInfoAsyncMock).not.toHaveBeenCalled();
  });

  it("reports reachable when the check itself fails", async () => {
    // A throw means the stat could not be performed — an unavailable native
    // module, a revoked grant, a URI shape this platform will not stat — not
    // that the file is gone. Reporting "gone" here would re-point rows on a
    // device where the check is simply broken.
    getInfoAsyncMock.mockRejectedValue(new Error("UnavailabilityError"));

    expect(await isLocationReachable("content://unknown")).toBe(true);
  });
});
