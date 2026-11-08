import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { SegmentedControl } from "@/components/ui/card/segmented-control";

/**
 * The collapsed strip's two states, as a listener sees them.
 *
 * The bug this exists for: a selected segment used to swap its glyph for its
 * name, so the strip was four icons and one bare word — the tab you were
 * looking at was the one tab you could not recognise. The glyph is now drawn in
 * every state.
 */

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: { snappy: {}, page: {} },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

/**
 * The real `Icon` draws a private-use glyph character, which is unreadable in
 * an assertion. This renders the name instead — the component's contract is
 * "which glyph did you ask for", and that is what is being checked.
 *
 * `require` rather than imports because a `jest.mock` factory is hoisted above
 * the module's own imports, where anything it closed over would still be
 * uninitialised.
 */
jest.mock("@/components/ui/icon", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    Icon: ({ name }: { name: string }) =>
      React.createElement(Text, null, `glyph:${name}`),
  };
});

const OPTIONS = [
  { value: "tracks", label: "Tracks", icon: "music" },
  { value: "folders", label: "Folders", icon: "folder" },
  { value: "playlists", label: "Playlists", icon: "playlists" },
] as const;

describe("SegmentedControl with collapsed labels", () => {
  it("keeps the glyph on the selected segment as well as its name", async () => {
    await render(
      <SegmentedControl options={OPTIONS} value="folders" onChange={() => {}} collapse />,
    );

    const selected = screen.getByLabelText("Folders");
    expect(within(selected).getByText("Folders")).toBeTruthy();
    expect(within(selected).getByText("glyph:folder")).toBeTruthy();
  });

  it("shows only the glyph on the segments that are not selected", async () => {
    await render(
      <SegmentedControl options={OPTIONS} value="folders" onChange={() => {}} collapse />,
    );

    const other = screen.getByLabelText("Playlists");
    expect(within(other).queryByText("Playlists")).toBeNull();
    expect(within(other).getByText("glyph:playlists")).toBeTruthy();
  });

  it("moves the glyph and the name together when another segment is chosen", async () => {
    const onChange = jest.fn();
    const view = await render(
      <SegmentedControl options={OPTIONS} value="tracks" onChange={onChange} collapse />,
    );

    await fireEvent.press(screen.getByLabelText("Playlists"));
    expect(onChange).toHaveBeenCalledWith("playlists");

    await view.rerender(
      <SegmentedControl options={OPTIONS} value="playlists" onChange={onChange} collapse />,
    );
    const moved = screen.getByLabelText("Playlists");
    expect(within(moved).getByText("Playlists")).toBeTruthy();
    expect(within(moved).getByText("glyph:playlists")).toBeTruthy();
  });

  it("shows the name of every segment when it is not collapsed", async () => {
    await render(<SegmentedControl options={OPTIONS} value="folders" onChange={() => {}} />);

    for (const option of OPTIONS) {
      const segment = screen.getByLabelText(option.label);
      expect(within(segment).getByText(option.label)).toBeTruthy();
      expect(within(segment).getByText(`glyph:${option.icon}`)).toBeTruthy();
    }
  });
});
