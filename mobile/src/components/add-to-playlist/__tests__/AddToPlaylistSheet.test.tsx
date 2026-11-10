/**
 * The add-to-playlist picker.
 *
 * Two things are protected here, and the second is the one that broke: the
 * sheet lists the playlists and offers a way to make a new one, and its list is
 * *content-sized* rather than `flex: 1`. A `flex: 1` scroll view inside a sheet
 * — a surface that measures itself — collapses to zero height, which leaves the
 * sheet drawing a header with nothing under it.
 */

import { fireEvent, render } from "@testing-library/react-native";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AddToPlaylistSheet } from "@/components/add-to-playlist/AddToPlaylistSheet";
import { KeyboardScrollView } from "@/components/ui/keyboard-scroll-view";
import type { LocalPlaylist } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";
import { useAddToPlaylistStore } from "@/store/addToPlaylistStore";

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260, screen: 320, instant: 1 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  stagger: () => 0,
  spring: {
    damping: 0.6,
    stiffness: 400,
    sheet: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 320 },
    page: { damping: 20, stiffness: 180 },
  },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

jest.mock("@/services/PlaylistService", () => ({
  PlaylistService: {
    list: jest.fn(),
    addTracks: jest.fn(async () => {}),
    removeTracks: jest.fn(async () => {}),
    createWithTracks: jest.fn(async () => ({})),
  },
}));

const mockPlaylist = (id: string, title: string): LocalPlaylist => ({
  id,
  serverId: null,
  title,
  description: null,
  isPublic: false,
  items: [],
  deletedAt: null,
  syncStatus: "synced",
  createdAt: 0,
  updatedAt: 0,
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const list = jest.mocked(PlaylistService.list);

beforeEach(() => {
  jest.clearAllMocks();
  useAddToPlaylistStore.getState().dismiss();
  useAddToPlaylistStore.getState().open({
    trackIds: ["t1"],
    title: "A track",
  });
});

describe("AddToPlaylistSheet", () => {
  it("lists the playlists it can add to", async () => {
    list.mockResolvedValue([
      mockPlaylist("p1", "Commute"),
      mockPlaylist("p2", "Night"),
    ]);

    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddToPlaylistSheet />
      </SafeAreaProvider>,
    );

    expect(await view.findByText("Commute")).toBeTruthy();
    expect(view.getByText("Night")).toBeTruthy();
  });

  it("offers the inline create row", async () => {
    list.mockResolvedValue([]);

    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddToPlaylistSheet />
      </SafeAreaProvider>,
    );

    expect(await view.findByLabelText("Create a new playlist")).toBeTruthy();
  });

  it("adds the tracks when a playlist is tapped", async () => {
    list.mockResolvedValue([mockPlaylist("p1", "Commute")]);

    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddToPlaylistSheet />
      </SafeAreaProvider>,
    );

    await fireEvent.press(await view.findByText("Commute"));

    expect(PlaylistService.addTracks).toHaveBeenCalledWith("p1", ["t1"]);
  });

  it("still shows a usable sheet when the read fails", async () => {
    // A rejected read must not leave the list in its loading state: the sheet
    // would then draw its header and nothing else.
    list.mockRejectedValue(new Error("db closed"));

    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddToPlaylistSheet />
      </SafeAreaProvider>,
    );

    expect(await view.findByLabelText("Create a new playlist")).toBeTruthy();
    expect(view.getByText(/No playlists yet/)).toBeTruthy();
  });
});

describe("KeyboardScrollView's content-sized mode", () => {
  it("fills its parent by default", async () => {
    const view = await render(
      <KeyboardScrollView testID="list">
        <ScrollView />
      </KeyboardScrollView>,
    );

    const scroll = view.getByTestId("list");
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flex: 1 });
  });

  it("is as tall as its content when asked, so a sheet can size it", async () => {
    // `flex: 1` means `flexBasis: 0`; in an auto-height column there is no free
    // space to grow into, so the box would resolve to nothing.
    const view = await render(
      <KeyboardScrollView testID="list" fitContent style={{ maxHeight: 300 }}>
        <ScrollView />
      </KeyboardScrollView>,
    );

    const scroll = view.getByTestId("list");
    const style = StyleSheet.flatten(scroll.props.style);
    expect(style).toMatchObject({ flexGrow: 0, flexBasis: "auto", maxHeight: 300 });
    expect(style.flex).toBeUndefined();
  });
});
