import { fireEvent, render, screen } from "@testing-library/react-native";

import RegisterScreen from "@/app/(auth)/register";

type AuthState = {
  login: jest.Mock;
  register: jest.Mock;
  isSubmitting: boolean;
  error: string | null;
};

let mockAuthState: AuthState;

jest.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: AuthState) => unknown) =>
    selector(mockAuthState),
}));

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  mockAuthState = {
    login: jest.fn(() => Promise.resolve()),
    register: jest.fn(() => Promise.resolve()),
    isSubmitting: false,
    error: null,
  };
});

describe("RegisterScreen", () => {
  it("uses the password field's reveal control and dismisses on Go", async () => {
    await render(<RegisterScreen />);

    expect(screen.getByLabelText("Show password")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("••••••••").props.submitBehavior,
    ).toBe("blurAndSubmit");
  });

  it("submits the trimmed values and omits a blank display name", async () => {
    await render(<RegisterScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText("listener"),
      "  syd  ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "  syd@example.com  ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("••••••••"),
      "secret",
    );
    await fireEvent.press(screen.getByText("Create account"));

    expect(mockAuthState.register).toHaveBeenCalledWith({
      username: "syd",
      email: "syd@example.com",
      password: "secret",
    });
  });
});
