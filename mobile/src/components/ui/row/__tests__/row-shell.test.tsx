import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import type { RowAction } from "@/components/ui/row/row-actions";
import { RowShell } from "@/components/ui/row/row-shell";

// `Modal` is not mounted by the test renderer. The menu's contents still need
// to be inspectable, so render them inline while visible.
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  function MockModal({
    children,
    visible,
  }: {
    children: React.ReactNode;
    visible?: boolean;
  }) {
    return visible ? React.createElement(View, null, children) : null;
  }
  return { __esModule: true, default: MockModal };
});

jest.mock("@/theme/motion", () => ({
  press: { down: 0.92, overshoot: 1.05, rest: 1 },
  spring: { press: {}, release: {}, bouncy: {} },
  useMotionEnabled: () => false,
}));

function action(key: string, width = 52, priority = 1): RowAction {
  return {
    key,
    width,
    priority,
    icon: "play",
    label: `Run ${key}`,
    onPress: jest.fn(),
    node: (
      <Pressable testID={`inline-${key}`} accessibilityLabel={`Inline ${key}`}>
        <Text>{key}</Text>
      </Pressable>
    ),
  };
}

function renderRow(actions: readonly RowAction[], cardWidth: number) {
  return render(
    <RowShell
      density="dense"
      title="A very long Persian title that must not be squeezed"
      meta="12 tracks"
      actions={actions}
      onPress={() => {}}
      accessibilityLabel="Open the item"
      accessibilityHint="Opens this item"
      cardWidth={cardWidth}
      testID="row"
    />,
  );
}

describe("RowShell", () => {
  it("keeps the body and the controls as siblings, never nested", async () => {
    await renderRow([action("play", 40, 5)], 430);

    const body = screen.getByTestId("row-body");
    expect(within(body).queryByTestId("inline-play")).toBeNull();
    expect(screen.getByTestId("inline-play")).toBeTruthy();
  });

  it("labels the row and names the overflow", async () => {
    await renderRow(
      [
        action("play", 80, 5),
        action("add", 80, 3),
        action("history", 80, 2),
        action("delete", 80, 1),
      ],
      280,
    );

    expect(screen.getByLabelText("Open the item")).toBeTruthy();
    expect(screen.getByLabelText("More actions for A very long Persian title that must not be squeezed")).toBeTruthy();
  });

  it("reflows four controls onto their own line before hiding one", async () => {
    const actions = [
      action("play", 52, 8),
      action("add", 52, 6),
      action("history", 52, 4),
      action("delete", 52, 2),
    ];
    await renderRow(actions, 320);

    for (const item of actions) {
      expect(screen.getByTestId(`inline-${item.key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("row-overflow")).toBeNull();
  });

  it("offers every action that did not fit in the menu", async () => {
    const actions = Array.from({ length: 8 }, (_, index) =>
      action(`a${index}`, 52, 8 - index),
    );
    await renderRow(actions, 320);

    await fireEvent.press(screen.getByTestId("row-overflow"));

    for (const item of actions) {
      const inline = screen.queryByTestId(`inline-${item.key}`);
      const menu = screen.queryByTestId(`row-menu-${item.key}`);
      expect(inline ?? menu).not.toBeNull();
    }
  });

  it("keeps a menu-only action out of the line and in the menu", async () => {
    const remove = { ...action("delete", 40, 0), menuOnly: true };
    await renderRow([action("play", 40, 4), remove], 430);

    expect(screen.queryByTestId("inline-delete")).toBeNull();
    await fireEvent.press(screen.getByTestId("row-overflow"));
    expect(screen.getByTestId("row-menu-delete")).toBeTruthy();
  });

  it("states why a disabled row cannot be used", async () => {
    await render(
      <RowShell
        density="dense"
        title="A missing file"
        disabled
        disabledReason="The file is no longer on this device"
        accessibilityLabel="The missing file"
        cardWidth={360}
      />,
    );

    const body = screen.getByLabelText("The missing file");
    expect(body.props.accessibilityState).toEqual({ disabled: true });
    expect(body.props.accessibilityHint).toBe("The file is no longer on this device");
  });
});
