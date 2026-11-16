/**
 * The AI page and one tool's page, rendered for real.
 *
 * The thing worth protecting here is the promise: four buttons, each named, each
 * leading to a screen that says exactly what was asked for and nothing that
 * contradicts it. A snapshot would not catch the failure that matters — a card
 * that silently loses its tool, or a "coming soon" screen that has drifted into
 * a different sentence.
 */

/* `jest.mock` factories are hoisted above the imports, so anything they need at
   call time has to come from `require` rather than from a module binding. */
/* eslint-disable @typescript-eslint/no-require-imports */

import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AiFeatureScreen from "@/app/ai/[feature]";
import AiScreen from "@/app/(tabs)/ai";
import { AI_COMING_SOON_BODY, AI_COMING_SOON_HEADLINE } from "@/lib/aiFeatures";

/** Reassigned per case; the hooks below read whatever is current. */
let mockParams: Record<string, string | undefined> = {};

/**
 * One router object for the whole file.
 *
 * `useRouter` has to return the *same* instance every render, or a spy handed
 * back by a fresh closure is a spy nobody can assert on. It is declared below
 * the `jest.mock` call because the factory only reads it when a component
 * renders, long after this module has finished initialising.
 */
const mockRouter = {
  navigate: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: () => true,
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/hooks/use-theme", () => {
  const { colors } = require("@/theme/tokens");
  return { useTheme: () => colors.light, useScheme: () => "light" };
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
  const { Pressable, Text, View } = require("react-native");
  return {
    Screen: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    // Faithful enough to be worth asserting on: the title it prints, and the
    // back control it wires to the screen's own `onBack`.
    ScreenHeader: ({ title, onBack }: { title: string; onBack?: () => void }) =>
      React.createElement(
        View,
        null,
        onBack
          ? React.createElement(
              Pressable,
              { accessibilityRole: "button", accessibilityLabel: "Go back", onPress: onBack },
              React.createElement(Text, null, "Back"),
            )
          : null,
        React.createElement(Text, null, title),
      ),
  };
});

// The gradient is a native view; the test is about words and targets.
jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { LinearGradient: (props: { children?: unknown }) => React.createElement(View, props) };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/**
 * Renders and hands back the queries.
 *
 * `render` is asynchronous in this version of the testing library, so it is
 * awaited here rather than at each call site. The returned view is used instead
 * of the module-level `screen`, which is only populated by the sync path.
 */
async function renderScreen(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

beforeEach(() => {
  mockParams = {};
  mockRouter.navigate.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
});

describe("the AI page", () => {
  it("offers all four tools as buttons", async () => {
    const view = await renderScreen(<AiScreen />);

    for (const title of [
      "Transcribe audio",
      "Summarize text",
      "Generate audio summary",
      "Remove noise and enhance audio",
    ]) {
      expect(view.getByText(title)).toBeTruthy();
    }
  });

  it("says each tool is coming before it is pressed", async () => {
    const view = await renderScreen(<AiScreen />);

    const card = view.getByLabelText(/^Transcribe audio\. .* Coming soon\.$/);
    expect(card).toBeTruthy();
  });

  it("opens the tool's own page rather than acting on the row it came from", async () => {
    const view = await renderScreen(<AiScreen />);

    fireEvent.press(view.getByLabelText(/^Generate audio summary\./));

    expect(mockRouter.navigate).toHaveBeenCalledWith("/ai/audioSummary");
  });

  it("explains the cost once, rather than on all four cards", async () => {
    const view = await renderScreen(<AiScreen />);

    expect(view.getByText(/monthly bill rather than a one-off purchase/)).toBeTruthy();
    expect(view.getByText("Server · not provisioned")).toBeTruthy();
  });
});

describe("a tool's page", () => {
  it("shows the message it was asked to show", async () => {
    mockParams = { feature: "transcribe" };
    const view = await renderScreen(<AiFeatureScreen />);

    expect(view.getByText("Transcribe audio")).toBeTruthy();
    expect(view.getByText(AI_COMING_SOON_HEADLINE)).toBeTruthy();
    expect(view.getByText(AI_COMING_SOON_BODY)).toBeTruthy();
  });

  it("says what the tool would have done, not just that it is absent", async () => {
    mockParams = { feature: "enhance" };
    const view = await renderScreen(<AiFeatureScreen />);

    expect(view.getByText("WHAT IT WILL DO")).toBeTruthy();
    expect(view.getByText(/Strips hiss, hum and room echo/)).toBeTruthy();
  });

  it("still shows the message for a link that names no real tool", async () => {
    mockParams = { feature: "invent-a-podcast" };
    const view = await renderScreen(<AiFeatureScreen />);

    expect(view.getByText("AI tools")).toBeTruthy();
    expect(view.getByText(AI_COMING_SOON_BODY)).toBeTruthy();
  });

  it("reads the whole message to a screen reader as one statement", async () => {
    mockParams = { feature: "summarize" };
    const view = await renderScreen(<AiFeatureScreen />);

    expect(
      view.getByLabelText(
        `Summarize text. ${AI_COMING_SOON_HEADLINE} ${AI_COMING_SOON_BODY}`,
      ),
    ).toBeTruthy();
  });

  it("leaves the page it was opened from", async () => {
    mockParams = { feature: "summarize" };
    const view = await renderScreen(<AiFeatureScreen />);

    fireEvent.press(view.getByLabelText("Go back"));

    expect(mockRouter.back).toHaveBeenCalled();
  });
});
