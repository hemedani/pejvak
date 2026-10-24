import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { QueueSheet } from "@/components/player/QueueSheet";
import { useQueueTracks } from "@/hooks/use-queue-tracks";
import type { LocalTrack } from "@/lib/db/types";
import type { PlaybackContext } from "@/lib/playbackContext";

jest.mock("@/hooks/use-queue-tracks", () => ({
  useQueueTracks: jest.fn(),
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: {
    damping: 0.6,
    stiffness: 400,
    sheet: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 320 },
  },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

const mockUseQueueTracks = jest.mocked(useQueueTracks);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

function track(id: string, title: string): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title,
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
    source: null,
    sourceUri: null,
    sourcePath: null,
    sourceSize: null,
    sourceMtime: null,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    origin: "local",
    streamUrl: null,
    sourceId: null,
    externalId: null,
    collectionKey: null,
    collectionTitle: null,
    downloadedAt: null,
    downloadPath: null,
  };
}

const tracks = [track("a", "Intro"), track("b", "Second"), track("c", "Third")];
const folder: PlaybackContext = { type: "folder", key: "Physics", title: "Physics" };

beforeEach(() => {
  mockUseQueueTracks.mockReturnValue({
    tracks: new Map(tracks.map((item) => [item.id, item])),
    loading: false,
  });
});

describe("QueueSheet", () => {
  it("marks the current track and closes instead of restarting it", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await renderSheet(
      <QueueSheet
        queue={["a", "b", "c"]}
        currentIndex={1}
        context={folder}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Second, playing now"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("jumps to another track by its position in the queue", async () => {
    const onSelect = jest.fn();
    await renderSheet(
      <QueueSheet
        queue={["a", "b", "c"]}
        currentIndex={0}
        context={folder}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Play Third, track 3"));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("names the collection and how many tracks the queue holds", async () => {
    await renderSheet(
      <QueueSheet
        queue={["a", "b", "c"]}
        currentIndex={0}
        context={folder}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText("Folder · 3 tracks")).toBeTruthy();
  });

  it("closes from the sheet's button", async () => {
    const onClose = jest.fn();
    await renderSheet(
      <QueueSheet
        queue={["a"]}
        currentIndex={0}
        context={null}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Close queue"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
