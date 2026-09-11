import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useSyncStatus } from "@/hooks/use-sync-status";
import { LocalDBService } from "@/services/LocalDBService";
import { SettingsService } from "@/services/SettingsService";
import { syncAll } from "@/services/SyncService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: { getPendingCounts: jest.fn() },
}));
jest.mock("@/services/SettingsService", () => ({
  SettingsService: { getLastSyncAt: jest.fn() },
}));
jest.mock("@/services/SyncService", () => ({
  syncAll: jest.fn(() => Promise.resolve({ failed: 0 })),
}));

const getPendingCounts = jest.mocked(LocalDBService.getPendingCounts);
const getLastSyncAt = jest.mocked(SettingsService.getLastSyncAt);
const mockedSyncAll = jest.mocked(syncAll);

const counts = (n: number) => ({
  tracks: n,
  sessions: n,
  annotations: n,
  playlists: n,
});

beforeEach(() => jest.clearAllMocks());

describe("useSyncStatus", () => {
  it("loads pending counts and the last sync time", async () => {
    getPendingCounts.mockResolvedValue(counts(2));
    getLastSyncAt.mockResolvedValue(1234);

    const { result } = await renderHook(() => useSyncStatus());

    await waitFor(() => expect(result.current.pendingTotal).toBe(8));
    expect(result.current.lastSyncAt).toBe(1234);
  });

  it("syncs now and refreshes the counts", async () => {
    getPendingCounts.mockResolvedValueOnce(counts(1)).mockResolvedValueOnce(counts(0));
    getLastSyncAt.mockResolvedValue(null);

    const { result } = await renderHook(() => useSyncStatus());
    await waitFor(() => expect(result.current.pendingTotal).toBe(4));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(mockedSyncAll).toHaveBeenCalledTimes(1);
    expect(result.current.pendingTotal).toBe(0);
    expect(result.current.syncing).toBe(false);
  });
});
