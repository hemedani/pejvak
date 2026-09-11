import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { LocalPlaylist } from "@/lib/db/types";
import { usePlaylists } from "@/hooks/use-playlists";
import { PlaylistService } from "@/services/PlaylistService";

jest.mock("@/services/PlaylistService", () => ({
  PlaylistService: { list: jest.fn() },
}));

const list = jest.mocked(PlaylistService.list);

function playlist(id: string): LocalPlaylist {
  return {
    id,
    serverId: null,
    title: id,
    description: null,
    isPublic: false,
    items: [],
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("usePlaylists", () => {
  it("loads playlists and refreshes", async () => {
    list.mockResolvedValueOnce([playlist("p1")]).mockResolvedValueOnce([]);

    const { result } = await renderHook(() => usePlaylists());
    await waitFor(() => expect(result.current.playlists).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.playlists).toHaveLength(0);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
