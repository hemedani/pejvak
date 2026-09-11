import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { HistoryItem } from "@/lib/history";
import { useHistory } from "@/hooks/use-history";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getSessionsForHistory: jest.fn(),
  },
}));

const getSessionsForHistory = jest.mocked(LocalDBService.getSessionsForHistory);

function item(id: string): HistoryItem {
  return {
    session: {
      id,
      serverId: null,
      trackId: "t1",
      contentHash: "hash-1",
      startedAt: 100,
      endedAt: 160,
      startPositionSec: 0,
      endPositionSec: 60,
      durationListenedSec: 60,
      playbackSpeed: 1,
      completed: true,
      interrupted: false,
      deviceInfo: null,
      syncStatus: "synced",
      createdAt: 0,
      updatedAt: 0,
    },
    track: { id: "t1", title: "Book", author: null, contentHash: "hash-1" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useHistory", () => {
  it("loads the local session history", async () => {
    getSessionsForHistory.mockResolvedValue([item("s1")]);

    const { result } = await renderHook(() => useHistory());

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(getSessionsForHistory).toHaveBeenCalledTimes(1);
  });

  it("refreshes on demand", async () => {
    getSessionsForHistory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item("s1")]);

    const { result } = await renderHook(() => useHistory());
    await waitFor(() => expect(getSessionsForHistory).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.items).toHaveLength(1);
    expect(getSessionsForHistory).toHaveBeenCalledTimes(2);
  });
});
