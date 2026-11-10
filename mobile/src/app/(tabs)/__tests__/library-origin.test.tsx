/**
 * The Library's Tracks view, split by where the audio comes from.
 *
 * The screen is rendered for real — the pager, the reveal wrappers and the
 * sheet machinery are stubbed, but the list, the sub-tab and the queue are the
 * production ones — because the thing worth protecting is the *wiring*: that
 * the control and the rows below it are driven by the same split.
 */

/* `jest.mock` factories are hoisted above the imports, so anything they need at
   call time has to come from `require` rather than from a module binding. */
/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from "@testing-library/react-native";

import type { LocalTrack } from "@/lib/db/types";
import * as TrackPlayerService from "@/services/TrackPlayerService";

function mockTrack(
  id: string,
  title: string,
  origin: "local" | "online",
): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title,
    fileName: `${title}.mp3`,
    fileUri: `file:///${title}.mp3`,
    durationSec: 60,
    fileSizeBytes: 1024,
    mimeType: "audio/mpeg",
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    source: origin === "online" ? null : "mediastore",
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
    origin,
    streamUrl: origin === "online" ? `https://example.com/${id}.mp3` : null,
    sourceId: origin === "online" ? "manahej" : null,
    externalId: origin === "online" ? id : null,
    collectionKey: origin === "online" ? `manahej:${id}` : null,
    collectionTitle: origin === "online" ? "Course" : null,
    downloadedAt: null,
    downloadPath: null,
  };
}

const LOCAL_ONE = mockTrack("l1", "LocalOne", "local");
const LOCAL_TWO = mockTrack("l2", "LocalTwo", "local");
const ONLINE_ONE = mockTrack("o1", "OnlineOne", "online");
const ONLINE_TWO = mockTrack("o2", "OnlineTwo", "online");

/** What the database returns for this test; reassigned per case. */
let mockLibrary: LocalTrack[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/store/settingsStore", () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ languageCode: null, setLanguage: jest.fn() }),
}));

jest.mock("@/hooks/use-theme", () => {
  const { colors } = require("@/theme/tokens");
  return { useTheme: () => colors.dark, useScheme: () => "dark" };
});

jest.mock("@/theme/motion", () => {
  const actual = jest.requireActual("@/theme/motion");
  return { ...actual, useMotionEnabled: () => false };
});

jest.mock("@/components/ui/haptics", () => ({ triggerHaptic: jest.fn() }));

jest.mock("@/components/motion/Reveal", () => ({
  Reveal: ({ children }: { children: unknown }) => children,
}));

jest.mock("@/components/motion/Screen", () => {
  const React = require("react");
  const { Text, View } = require("react-native");
  return {
    Screen: ({ children }: { children: unknown }) =>
      React.createElement(View, null, children),
    // The header's own layout is not under test, but its subtitle is: it is the
    // screen's one statement of how many tracks the visible half holds.
    ScreenHeader: ({
      subtitle,
      action,
    }: {
      subtitle?: string | null;
      action?: unknown;
    }) =>
      React.createElement(
        View,
        null,
        subtitle ? React.createElement(Text, null, subtitle) : null,
        action,
      ),
  };
});

// The pager is not what is under test; render the active page only.
jest.mock("@/components/motion/SwipePager", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SwipePager: ({
      index,
      renderPage,
    }: {
      index: number;
      renderPage: (pageIndex: number) => unknown;
    }) => React.createElement(View, null, renderPage(index)),
  };
});

jest.mock("@/components/online/language-picker-sheet", () => ({
  LanguagePickerSheet: () => null,
}));

jest.mock("@/hooks/use-artwork-backfill", () => ({
  useArtworkBackfill: () => ({ run: jest.fn(async () => ({ changed: [] })) }),
}));
jest.mock("@/hooks/use-folders", () => ({
  useFolders: () => ({ folders: [], refresh: jest.fn(async () => []) }),
}));
jest.mock("@/hooks/use-missing-tracks", () => ({
  useMissingTracks: () => ({ missing: [], refresh: jest.fn(async () => []) }),
}));
jest.mock("@/hooks/use-playlists", () => ({
  usePlaylists: () => ({ playlists: [], refresh: jest.fn(async () => []) }),
}));
jest.mock("@/hooks/use-smart-playlists", () => ({
  useSmartPlaylists: () => ({ playlists: [], refresh: jest.fn(async () => []) }),
}));
jest.mock("@/hooks/use-playlist-origins", () => ({
  usePlaylistOrigins: () => ({}),
}));
jest.mock("@/hooks/use-recent-plays", () => ({
  useRecentPlays: () => ({ recent: [], refresh: jest.fn(async () => []) }),
}));

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getAllTracks: jest.fn(async () => mockLibrary),
    getAnnotationCounts: jest.fn(async () => ({})),
  },
}));
jest.mock("@/services/FolderService", () => ({ FolderService: {} }));
jest.mock("@/services/PlaylistService", () => ({ PlaylistService: {} }));
jest.mock("@/services/TrackPlayerService", () => ({
  playQueueAt: jest.fn(async () => {}),
}));

jest.mock("@/lib/idle", () => ({
  runWhenIdle: () => ({ cancel: () => {} }),
}));

// eslint-disable-next-line import/first
import LibraryScreen from "@/app/(tabs)/index";

beforeEach(() => {
  mockLibrary = [LOCAL_ONE, LOCAL_TWO, ONLINE_ONE, ONLINE_TWO];
  jest.clearAllMocks();
});

describe("the Tracks view's Local/Online sub-tab", () => {
  it("shows both halves and switches between them", async () => {
    const view = await render(<LibraryScreen />);

    // The Local half is what opens: it is the one that plays with no network.
    await view.findByText("LocalOne");
    expect(view.getByText("LocalTwo")).toBeTruthy();
    expect(view.queryByText("OnlineOne")).toBeNull();

    await fireEvent.press(view.getByRole("radio", { name: "Online" }));

    expect(view.getByText("OnlineOne")).toBeTruthy();
    expect(view.getByText("OnlineTwo")).toBeTruthy();
    expect(view.queryByText("LocalOne")).toBeNull();

    await fireEvent.press(view.getByRole("radio", { name: "Local" }));

    expect(view.getByText("LocalOne")).toBeTruthy();
    expect(view.queryByText("OnlineOne")).toBeNull();
  });

  it("is absent when the library holds only one kind", async () => {
    // A switch whose other half is an empty list is noise, so the control is a
    // choice only when there is something to choose between.
    mockLibrary = [ONLINE_ONE, ONLINE_TWO];

    const view = await render(<LibraryScreen />);

    await view.findByText("OnlineOne");
    expect(view.queryByRole("radio", { name: "Local" })).toBeNull();
    expect(view.queryByRole("radio", { name: "Online" })).toBeNull();
  });

  it("opens on the only kind there is, with no control", async () => {
    mockLibrary = [LOCAL_ONE];

    const view = await render(<LibraryScreen />);

    await view.findByText("LocalOne");
    expect(view.queryByRole("radio", { name: "Online" })).toBeNull();
  });

  it("queues the half on screen, not the whole library", async () => {
    // A row the sub-tab has hidden must not be played next: next/previous walk
    // the list the listener is looking at.
    const view = await render(<LibraryScreen />);
    await view.findByText("LocalOne");

    await fireEvent.press(view.getByLabelText("Play LocalOne"));

    expect(TrackPlayerService.playQueueAt).toHaveBeenCalledWith(
      [LOCAL_ONE.id, LOCAL_TWO.id],
      0,
    );
  });

  it("names the half and its count in the subtitle", async () => {
    const view = await render(<LibraryScreen />);
    await view.findByText("LocalOne");

    expect(view.getByText("2 local tracks")).toBeTruthy();

    await fireEvent.press(view.getByRole("radio", { name: "Online" }));

    expect(view.getByText("2 online tracks")).toBeTruthy();
  });
});
