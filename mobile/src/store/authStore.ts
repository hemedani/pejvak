import { create } from "zustand";

import { setAuthToken } from "@/lib/client";
import { LesanError } from "@/lib/errors";
import * as AuthService from "@/services/AuthService";
import type { AuthUser } from "@/services/AuthService";
import { clearToken, getToken, setToken } from "@/services/secureStore";

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
    try {
      const token = await getToken();
      if (!token) {
        setAuthToken(null);
        set({ status: "unauthenticated", user: null, token: null });
        return;
      }
      setAuthToken(token);
      const user = await AuthService.getMe();
      set({ status: "authenticated", user, token });
    } catch {
      await clearToken();
      setAuthToken(null);
      set({ status: "unauthenticated", user: null, token: null });
    }
  },

  login: async (input) => {
    set({ isSubmitting: true, error: null });
    try {
      const { token, user } = await AuthService.login(input);
      await setToken(token);
      setAuthToken(token);
      set({ status: "authenticated", user, token, isSubmitting: false, error: null });
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
      setAuthToken(token);
      set({ status: "authenticated", user, token, isSubmitting: false, error: null });
    } catch (error) {
      set({ isSubmitting: false, error: toErrorMessage(error) });
      throw error;
    }
  },

  logout: async () => {
    await clearToken();
    setAuthToken(null);
    set({ status: "unauthenticated", user: null, token: null, error: null });
  },
}));
