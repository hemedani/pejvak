import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { TagInput } from "@/components/ui/field";

jest.mock("@/components/ui/keyboard-scroll-view", () => ({
  useFieldRegistrar: () => null,
}));

jest.mock("@/theme/motion", () => ({
  duration: { toggle: 120 },
  press: { rest: 1, down: 0.92, overshoot: 1.05 },
  spring: { damping: 0.6, stiffness: 400 },
  easing: { outQuint: [0.22, 1, 0.36, 1] },
  curve: (_easing: unknown, ms: number) => ({ duration: ms }),
  useMotionEnabled: () => false,
}));

function Harness({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <TagInput
      testID="tag-input"
      label="Tags"
      value={tags}
      onChange={setTags}
    />
  );
}

function input() {
  return screen.getByTestId("tag-input");
}

describe("TagInput", () => {
  it("commits a tag on submit and keeps the draft clear", async () => {
    await render(<Harness />);

    await fireEvent.changeText(input(), "Persian history");
    await fireEvent(input(), "submitEditing");

    expect(screen.getByText("Persian history")).toBeTruthy();
    expect(input().props.value).toBe("");
  });

  it("refuses a duplicate that differs only by Persian spelling", async () => {
    await render(<Harness initial={["کتاب"]} />);

    await fireEvent.changeText(input(), "كتاب");
    await fireEvent(input(), "submitEditing");

    expect(screen.getAllByText("کتاب")).toHaveLength(1);
    expect(screen.queryByText("كتاب")).toBeNull();
  });

  it("removes the last chip on backspace in an empty draft", async () => {
    await render(<Harness initial={["one", "two"]} />);

    await fireEvent(input(), "focus");
    await fireEvent(input(), "keyPress", { nativeEvent: { key: "Backspace" } });

    expect(screen.queryByText("two")).toBeNull();
    expect(screen.getByText("one")).toBeTruthy();
  });

  it("disables entry and explains the limit at ten tags", async () => {
    const ten = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
    await render(<Harness initial={ten} />);

    expect(input().props.editable).toBe(false);
    expect(screen.getByText("Up to 10 tags")).toBeTruthy();
  });
});
