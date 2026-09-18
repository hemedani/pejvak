/**
 * The picker's lifecycle, tested on the store rather than through the sheet.
 *
 * The invariant worth protecting is that `close()` is not `dismiss()`: closing
 * has to leave the request in place so the sheet can still render what it is
 * animating away, and only `dismiss()` — called once that animation has
 * finished — clears it. Collapsing the two would make the sheet vanish on the
 * frame the user tapped, with no exit.
 */

import {
  closeAddToPlaylist,
  openAddToPlaylist,
  useAddToPlaylistStore,
  type AddToPlaylistRequest,
} from "@/store/addToPlaylistStore";

function request(overrides: Partial<AddToPlaylistRequest> = {}): AddToPlaylistRequest {
  return { trackIds: ["a"], title: "Track A", ...overrides };
}

beforeEach(() => {
  useAddToPlaylistStore.setState({ request: null, closing: false });
});

describe("addToPlaylistStore", () => {
  it("starts closed", () => {
    const state = useAddToPlaylistStore.getState();
    expect(state.request).toBeNull();
    expect(state.closing).toBe(false);
  });

  it("opens with a request and is not closing", () => {
    useAddToPlaylistStore.getState().open(request());

    const state = useAddToPlaylistStore.getState();
    expect(state.request?.title).toBe("Track A");
    expect(state.closing).toBe(false);
  });

  it("keeps the request while closing, so the exit can still render", () => {
    useAddToPlaylistStore.getState().open(request());

    useAddToPlaylistStore.getState().close();

    const state = useAddToPlaylistStore.getState();
    expect(state.request).not.toBeNull();
    expect(state.closing).toBe(true);
  });

  it("clears everything on dismiss", () => {
    useAddToPlaylistStore.getState().open(request());
    useAddToPlaylistStore.getState().close();

    useAddToPlaylistStore.getState().dismiss();

    const state = useAddToPlaylistStore.getState();
    expect(state.request).toBeNull();
    expect(state.closing).toBe(false);
  });

  it("cancels a close when something new is opened mid-animation", () => {
    useAddToPlaylistStore.getState().open(request());
    useAddToPlaylistStore.getState().close();

    useAddToPlaylistStore.getState().open(request({ trackIds: ["b"], title: "Track B" }));

    const state = useAddToPlaylistStore.getState();
    expect(state.closing).toBe(false);
    expect(state.request?.trackIds).toEqual(["b"]);
  });

  it("is drivable from a plain event handler", () => {
    // Buttons call these rather than subscribing to the store.
    openAddToPlaylist(request({ title: "From a handler" }));
    expect(useAddToPlaylistStore.getState().request?.title).toBe("From a handler");

    closeAddToPlaylist();
    expect(useAddToPlaylistStore.getState().closing).toBe(true);
  });

  it("does not let a stale request survive a dismiss", () => {
    openAddToPlaylist(request());
    closeAddToPlaylist();
    useAddToPlaylistStore.getState().dismiss();

    openAddToPlaylist(request({ title: "Second" }));

    expect(useAddToPlaylistStore.getState().request?.title).toBe("Second");
    expect(useAddToPlaylistStore.getState().closing).toBe(false);
  });
});
