import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePlaylistDetail } from "@/hooks/use-playlist-detail";
import { PlaylistService } from "@/services/PlaylistService";

jest.mock("@/services/PlaylistService", () => ({
  PlaylistService: { loadDetail: jest.fn() },
}));

const loadDetail = jest.mocked(PlaylistService.loadDetail);

beforeEach(() => jest.clearAllMocks());

describe("usePlaylistDetail", () => {
  it("loads detail for the id", async () => {
    loadDetail.mockResolvedValue({
      playlist: {
        id: "p1",
        serverId: null,
        title: "Focus",
        description: null,
        isPublic: false,
        items: [],
        syncStatus: "pending",
        createdAt: 0,
        updatedAt: 0,
      },
      tracks: [],
      library: [],
    });

    const { result } = await renderHook(() => usePlaylistDetail("p1"));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data?.playlist.title).toBe("Focus");
    expect(loadDetail).toHaveBeenCalledWith("p1");
  });

  it("stays empty without an id", async () => {
    const { result } = await renderHook(() => usePlaylistDetail(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it("refreshes on demand", async () => {
    loadDetail.mockResolvedValue(null);

    const { result } = await renderHook(() => usePlaylistDetail("p1"));
    await waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(loadDetail).toHaveBeenCalledTimes(2);
  });
});
