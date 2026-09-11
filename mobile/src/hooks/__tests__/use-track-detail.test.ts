import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { LocalTrack } from "@/lib/db/types";
import { useTrackDetail } from "@/hooks/use-track-detail";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getTrackDetailData: jest.fn(),
  },
}));

const getTrackDetailData = jest.mocked(LocalDBService.getTrackDetailData);

const track: LocalTrack = {
  id: "t1",
  serverId: null,
  contentHash: "hash-1",
  title: "Book",
  fileName: null,
  fileUri: null,
  durationSec: 600,
  fileSizeBytes: 1024,
  mimeType: null,
  isAudiobook: true,
  author: null,
  narrator: null,
  artworkUrl: null,
  totalPlayCount: 0,
  totalListenTimeSec: 0,
  lastPlayedAt: null,
  syncStatus: "pending",
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useTrackDetail", () => {
  it("loads track, sessions, and annotations", async () => {
    getTrackDetailData.mockResolvedValue({ track, sessions: [], annotations: [] });

    const { result } = await renderHook(() => useTrackDetail("t1"));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.track.title).toBe("Book");
    expect(getTrackDetailData).toHaveBeenCalledWith("t1");
  });

  it("stays empty without a track id", async () => {
    const { result } = await renderHook(() => useTrackDetail(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(getTrackDetailData).not.toHaveBeenCalled();
  });

  it("refreshes on demand", async () => {
    getTrackDetailData.mockResolvedValue({ track, sessions: [], annotations: [] });

    const { result } = await renderHook(() => useTrackDetail("t1"));
    await waitFor(() => expect(getTrackDetailData).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(getTrackDetailData).toHaveBeenCalledTimes(2);
  });
});
