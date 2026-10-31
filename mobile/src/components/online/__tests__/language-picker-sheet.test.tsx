import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguagePickerSheet } from "@/components/online/language-picker-sheet";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSheet(
  overrides: Partial<Parameters<typeof LanguagePickerSheet>[0]> = {},
) {
  const props = {
    currentCode: "fa",
    onSelect: jest.fn(),
    onClear: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return {
    props,
    ...(await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <LanguagePickerSheet {...props} />
      </SafeAreaProvider>,
    )),
  };
}

describe("LanguagePickerSheet", () => {
  it("selects one language and closes", async () => {
    const { props } = await renderSheet();

    await fireEvent.press(screen.getByLabelText("Deutsch, German"));

    expect(props.onSelect).toHaveBeenCalledWith("de");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("folds Persian spellings when searching", async () => {
    await renderSheet();

    await fireEvent.changeText(screen.getByLabelText("Find a language"), "فارسى");

    expect(screen.getByText("فارسی")).toBeTruthy();
  });

  it("clears the chosen language", async () => {
    const { props } = await renderSheet();

    await fireEvent.press(screen.getByLabelText("Clear my language"));

    expect(props.onClear).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
