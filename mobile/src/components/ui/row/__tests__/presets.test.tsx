import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { View } from "react-native";

import {
  addToPlaylistAction,
  deleteAction,
  detailsAction,
  downloadAction,
  favoriteAction,
  historyAction,
  playFolderAction,
  playPlaylistAction,
  type RowAction,
} from "@/components/ui/row/row-actions";
import { useAddToPlaylistStore } from "@/store/addToPlaylistStore";
import { useContextHistoryStore } from "@/store/contextHistoryStore";
import { aurora, control } from "@/theme/tokens";

jest.mock("@/theme/motion", () => ({
  press: { down: 0.92, overshoot: 1.05, rest: 1 },
  spring: { press: {}, release: {}, bouncy: {} },
  useMotionEnabled: () => false,
}));

function renderNode(action: RowAction) {
  return render(<View>{action.node}</View>);
}

async function press(action: RowAction, label: string) {
  const view = await renderNode(action);
  await fireEvent.press(view.getByLabelText(label));
  return view;
}

beforeEach(() => {
  useAddToPlaylistStore.setState({ request: null, closing: false });
  useContextHistoryStore.setState({ request: null, closing: false });
});

describe("action presets", () => {
  it("shares one width and a descending priority order", () => {
    const play = playFolderAction({ title: "Lectures", onPress: jest.fn() });
    const add = addToPlaylistAction({ title: "Lectures", trackIds: ["a"] });
    const history = historyAction({
      type: "folder",
      contextKey: "Lectures",
      title: "Lectures",
    });
    const details = detailsAction({ title: "Lectures", onPress: jest.fn() });
    const remove = deleteAction({ title: "Lectures", onPress: jest.fn() });

    for (const action of [play, add, history, details, remove]) {
      expect(action.width).toBe(control.md);
    }
    expect(play.priority).toBeGreaterThan(add.priority);
    expect(add.priority).toBeGreaterThan(history.priority);
    expect(history.priority).toBeGreaterThan(details.priority);
    expect(details.priority).toBeGreaterThan(remove.priority);
  });

  it("names a folder's play action in the row and in the button", async () => {
    const onPress = jest.fn();
    const action = playFolderAction({ title: "Lectures", onPress });

    expect(action.key).toBe("play");
    expect(action.icon).toBe("play");
    expect(action.label).toBe("Play Lectures");

    await press(action, "Play folder Lectures");
    action.onPress();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("names a playlist's play action in the row and in the button", async () => {
    const onPress = jest.fn();
    const action = playPlaylistAction({ title: "Commute", onPress });

    expect(action.icon).toBe("play");
    expect(action.label).toBe("Play Commute");

    await press(action, "Play playlist Commute");
    action.onPress();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("opens the picker from the inline control and the menu entry alike", async () => {
    const action = addToPlaylistAction({
      title: "Chapter 1",
      trackIds: ["track-1"],
      ramp: aurora[0],
    });

    expect(action.icon).toBe("playlistAdd");
    expect(action.label).toBe("Add to a playlist");

    await press(action, "Add Chapter 1 to a playlist");
    await waitFor(() =>
      expect(useAddToPlaylistStore.getState().request).toMatchObject({
        trackIds: ["track-1"],
        title: "Chapter 1",
        isBatch: false,
      }),
    );

    useAddToPlaylistStore.setState({ request: null });
    action.onPress();
    await waitFor(() =>
      expect(useAddToPlaylistStore.getState().request?.trackIds).toEqual(["track-1"]),
    );
  });

  it("resolves ids lazily without opening an empty picker", async () => {
    const action = addToPlaylistAction({
      title: "Lectures",
      resolveTrackIds: async () => ["a", "b"],
    });

    action.onPress();
    await waitFor(() =>
      expect(useAddToPlaylistStore.getState().request).toMatchObject({
        trackIds: ["a", "b"],
        isBatch: true,
      }),
    );

    useAddToPlaylistStore.setState({ request: null });
    const empty = addToPlaylistAction({
      title: "Empty",
      resolveTrackIds: async () => [],
    });
    empty.onPress();
    await waitFor(() => expect(useAddToPlaylistStore.getState().request).toBeNull());
  });

  it("opens the collection history from either surface", async () => {
    const action = historyAction({
      type: "playlist",
      contextKey: "playlist-1",
      title: "Commute",
    });

    expect(action.icon).toBe("history");
    expect(action.label).toBe("Listening history");

    await press(action, "History for playlist Commute");
    await waitFor(() =>
      expect(useContextHistoryStore.getState().request).toMatchObject({
        type: "playlist",
        key: "playlist-1",
        title: "Commute",
      }),
    );

    useContextHistoryStore.setState({ request: null });
    action.onPress();
    expect(useContextHistoryStore.getState().request).not.toBeNull();
  });

  it("opens the details of a track from either surface", async () => {
    const onPress = jest.fn();
    const action = detailsAction({ title: "Chapter 1", onPress });

    expect(action.icon).toBe("chevronRight");
    expect(action.label).toBe("Details");

    await press(action, "Details for Chapter 1");
    action.onPress();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("toggles a collection's favorite mark in place", async () => {
    const onPress = jest.fn();
    const add = favoriteAction({ title: "Course", isFavorite: false, onPress });
    const remove = favoriteAction({ title: "Course", isFavorite: true, onPress });

    expect(add.icon).toBe("bookmark");
    expect(add.label).toBe("Add to favorites");
    expect(remove.icon).toBe("bookmarkFilled");
    expect(remove.label).toBe("Remove from favorites");

    await press(remove, "Remove from favorites");
    remove.onPress();
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("draws the download state's glyph and refuses to start it twice", async () => {
    const onPress = jest.fn();
    const idle = downloadAction({ title: "Course", state: "none", onPress });
    const working = downloadAction({ title: "Course", state: "downloading", onPress });
    const done = downloadAction({ title: "Course", state: "complete", onPress });

    expect(idle.icon).toBe("cloudDownload");
    expect(idle.label).toBe("Download this collection");
    expect(working.icon).toBe("cloudDownload");
    expect(done.icon).toBe("checkCircle");
    expect(done.label).toBe("Already downloaded");

    const view = await renderNode(working);
    const button = view.getByLabelText("Download Course");
    expect(button.props.accessibilityState).toEqual({ disabled: true });
  });

  it("draws delete in the danger colour and names what it removes", async () => {
    const onPress = jest.fn();
    const action = deleteAction({ title: "Commute", onPress });

    expect(action.icon).toBe("trash");
    expect(action.label).toBe("Delete Commute");
    expect(action.danger).toBe(true);

    await press(action, "Delete Commute");
    action.onPress();

    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
