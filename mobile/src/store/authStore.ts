import { create } from "zustand";

import { setAuthToken } from "@/lib/client";
import { LesanError } from "@/lib/errors";
import * as AuthService from "@/services/AuthService";
import type { AuthUser } from "@/services/AuthService";
import { clearToken, getToken, setToken } from "@/services/secureStore";
import { syncAll } from "@/services/SyncService";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type LoginInput = { email: string; password: string };

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
};

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
  isSubmitting: boolean;
  restore: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

const ERROR_MESSAGES: Record<string, string> = {
  offline: "You appear to be offline. Check your connection and try again.",
  timeout: "The server took too long to respond. Try again.",
  cancelled: "The request was cancelled. Try again.",
  unauthorized: "Your session expired. Please sign in again.",
  forbidden: "You do not have permission to do that.",
  validation: "Please check the information you entered.",
  server: "The server ran into a problem. Try again later.",
  invalid_response: "The server response could not be read.",
  unknown: "Something unexpected went wrong.",
};

function toErrorMessage(error: unknown): string {
  if (error instanceof LesanError) {
    return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.unknown;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return ERROR_MESSAGES.unknown;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  token: null,
  error: null,
  isSubmitting: false,

  restore: async () => {
    const token = await getToken().catch(() => null);
    if (!token) {
      setAuthToken(null);
      set({ status: "unauthenticated", user: null, token: null });
      return;
    }

    // A saved token is proof of a previous sign-in. Open the app on it and on
    // the last known profile without asking the server, so a tunnel or a
    // flight does not turn into a logout. `getMe` then refreshes the identity
    // in the background and is the only thing allowed to end the session.
    setAuthToken(token);
    const user = await AuthService.getCachedUser().catch(() => null);
    set({ status: "authenticated", user, token });
    void refreshIdentity(token);
    void syncAll().catch(() => undefined);
  },

  login: async (input) => {
    set({ isSubmitting: true, error: null });
    try {
      const { token, user } = await AuthService.login(input);
      await setToken(token);
      await AuthService.cacheUser(user).catch(() => undefined);
      setAuthToken(token);
      set({ status: "authenticated", user, token, isSubmitting: false, error: null });
      void syncAll().catch(() => undefined);
    } catch (error) {
      set({ isSubmitting: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  register: async (input) => {
    set({ isSubmitting: true, error: null });
    try {
      const { token, user } = await AuthService.register(input);
      await setToken(token);
      await AuthService.cacheUser(user).catch(() => undefined);
      setAuthToken(token);
      set({ status: "authenticated", user, token, isSubmitting: false, error: null });
      void syncAll().catch(() => undefined);
    } catch (error) {
      set({ isSubmitting: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  logout: async () => {
    await clearToken();
    await AuthService.clearCachedUser().catch(() => undefined);
    setAuthToken(null);
    set({ status: "unauthenticated", user: null, token: null, error: null });
  },
}));

/**
 * Only the server may end a restored session, and only by rejecting the token
 * (`validation` is the envelope failure the backend returns for a missing or
 * expired one). Offline, timeouts, cancelled requests and malformed responses
 * say nothing about whether the listener is still signed in.
 */
function isAuthRejection(error: unknown): boolean {
  return (
    error instanceof LesanError &&
    (error.code === "unauthorized" ||
      error.code === "forbidden" ||
      error.code === "validation")
  );
}

async function refreshIdentity(token: string): Promise<void> {
  try {
    const user = await AuthService.getMe();
    if (useAuthStore.getState().token !== token) {
      return;
    }
    await AuthService.cacheUser(user).catch(() => undefined);
    useAuthStore.setState({ user });
  } catch (error) {
    if (!isAuthRejection(error)) {
      return;
    }
    if (useAuthStore.getState().token !== token) {
      return;
    }
    await clearToken().catch(() => undefined);
    await AuthService.clearCachedUser().catch(() => undefined);
    setAuthToken(null);
    useAuthStore.setState({ status: "unauthenticated", user: null, token: null });
  }
}
