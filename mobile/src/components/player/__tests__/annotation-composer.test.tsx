import { fireEvent, render, screen } from "@testing-library/react-native";

import { AnnotationComposer } from "@/components/player/AnnotationComposer";
import type { LocalAnnotation } from "@/lib/db/types";

jest.mock("@/components/ui/keyboard-scroll-view", () => ({
  useFieldRegistrar: () => null,
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120, quick: 180, base: 260 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: { damping: 0.6, stiffness: 400, sheet: { damping: 20, stiffness: 180 } },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

function annotation(overrides: Partial<LocalAnnotation> = {}): LocalAnnotation {
  return {
    id: "a1",
    serverId: null,
    trackId: "track-1",
    contentHash: "hash-1",
    positionSec: 90,
    text: "",
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const noop = async () => true;

describe("AnnotationComposer", () => {
  it("cannot save an empty note", async () => {
    const onSave = jest.fn(noop);
    await render(
      <AnnotationComposer
        positionSec={90}
        annotation={null}
        creating={false}
        onCancel={() => {}}
        onSave={onSave}
      />,
    );

    await fireEvent.press(screen.getByText("Save note"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("starts a new note on the colour it was handed", async () => {
    await render(
      <AnnotationComposer
        positionSec={90}
        annotation={null}
        creating={false}
        initialColor="#208AEF"
        onCancel={() => {}}
        onSave={noop}
      />,
    );

    expect(
      screen.getByLabelText("Blue").props.accessibilityState,
    ).toEqual(expect.objectContaining({ checked: true }));
  });

  it("pre-fills the note it is editing", async () => {
    await render(
      <AnnotationComposer
        positionSec={90}
        annotation={annotation({
          text: "A useful idea",
          tags: ["chapter"],
          color: "#E5484D",
        })}
        creating={false}
        onCancel={() => {}}
        onSave={noop}
      />,
    );

    expect(screen.getByTestId("annotation-text").props.value).toBe(
      "A useful idea",
    );
    expect(screen.getByText("chapter")).toBeTruthy();
    expect(
      screen.getByLabelText("Red").props.accessibilityState,
    ).toEqual(expect.objectContaining({ checked: true }));
  });

  it("saves the trimmed text, tags and chosen colour", async () => {
    const onSave = jest.fn(noop);
    await render(
      <AnnotationComposer
        positionSec={90}
        annotation={null}
        creating={false}
        initialColor="#208AEF"
        onCancel={() => {}}
        onSave={onSave}
      />,
    );

    await fireEvent.changeText(
      screen.getByTestId("annotation-text"),
      "  A useful idea  ",
    );
    await fireEvent.changeText(screen.getByTestId("annotation-tags"), "chapter");
    await fireEvent(screen.getByTestId("annotation-tags"), "submitEditing");
    await fireEvent.press(screen.getByLabelText("Red"));
    await fireEvent.press(screen.getByText("Save note"));

    expect(onSave).toHaveBeenCalledWith({
      text: "A useful idea",
      tags: ["chapter"],
      color: "#E5484D",
    });
  });

  it("does not save on cancel", async () => {
    const onSave = jest.fn(noop);
    const onCancel = jest.fn();
    await render(
      <AnnotationComposer
        positionSec={90}
        annotation={null}
        creating={false}
        onCancel={onCancel}
        onSave={onSave}
      />,
    );

    await fireEvent.changeText(screen.getByTestId("annotation-text"), "note");
    await fireEvent.press(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
