import { fireEvent, render, screen } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";

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

describe("LoginScreen", () => {
  it("uses the password field's reveal control", async () => {
    await render(<LoginScreen />);
    expect(screen.getByLabelText("Show password")).toBeTruthy();
  });

  it("submits trimmed credentials from the password field", async () => {
    await render(<LoginScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "  syd@example.com  ",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("••••••••"),
      "secret",
    );
    await fireEvent.press(screen.getByText("Sign in"));

    expect(mockAuthState.login).toHaveBeenCalledWith({
      email: "syd@example.com",
      password: "secret",
    });
  });

  it("dismisses the keyboard from the last field", async () => {
    await render(<LoginScreen />);

    expect(
      screen.getByPlaceholderText("••••••••").props.submitBehavior,
    ).toBe("blurAndSubmit");
  });

  it("locks both fields while submitting", async () => {
    const view = await render(<LoginScreen />);
    mockAuthState.isSubmitting = true;
    await view.rerender(<LoginScreen />);

    expect(
      screen.getByPlaceholderText("you@example.com").props.editable,
    ).toBe(false);
    expect(
      screen.getByPlaceholderText("••••••••").props.editable,
    ).toBe(false);
  });
});
