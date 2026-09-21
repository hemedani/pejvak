import { renderHook, waitFor } from "@testing-library/react-native";
import * as Network from "expo-network";
import type { NetworkState } from "expo-network";

import { useSyncLifecycle } from "@/hooks/use-sync";
import { syncAll } from "@/services/SyncService";

jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(),
}));

jest.mock("@/services/SyncService", () => ({
  syncAll: jest.fn(),
}));

const addNetworkStateListener = jest.mocked(Network.addNetworkStateListener);
const syncAllMock = jest.mocked(syncAll);

let listener: ((state: NetworkState) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  listener = null;
  syncAllMock.mockResolvedValue({
    tracksRegistered: 0,
    sessionsSynced: 0,
    annotationsSynced: 0,
    playlistsSynced: 0,
    contextPlaysSynced: 0,
    failed: 0,
  });
  addNetworkStateListener.mockImplementation((callback) => {
    listener = callback;
    return { remove: jest.fn() };
  });
});

describe("useSyncLifecycle", () => {
  it("syncs once on mount", async () => {
    renderHook(() => useSyncLifecycle());
    await waitFor(() => expect(syncAllMock).toHaveBeenCalledTimes(1));
  });

  it("syncs again when connectivity is regained", async () => {
    renderHook(() => useSyncLifecycle());
    await waitFor(() => expect(syncAllMock).toHaveBeenCalledTimes(1));

    listener?.({ isConnected: true, isInternetReachable: true });

    await waitFor(() => expect(syncAllMock).toHaveBeenCalledTimes(2));
  });

  it("does not sync while disconnected", async () => {
    renderHook(() => useSyncLifecycle());
    await waitFor(() => expect(syncAllMock).toHaveBeenCalledTimes(1));

    listener?.({ isConnected: false });

    await Promise.resolve();
    expect(syncAllMock).toHaveBeenCalledTimes(1);
  });
});
