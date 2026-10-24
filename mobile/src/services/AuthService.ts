import type { BackendActRequest } from "@/lib/backend-types";
import { callTypedAct, type RequestOptions } from "@/lib/client";
import { LocalDBService } from "@/services/LocalDBService";

/**
 * The last profile the server confirmed, kept beside the token so an offline
 * launch can still say who is listening. A username and email are not secrets;
 * the credential itself stays in SecureStore.
 */
const CACHED_USER_KEY = "auth.cachedUser";

export type AuthUser = {
  _id?: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

type LoginDetails = BackendActRequest<"main", "user", "login">["details"];
type RegisterDetails = BackendActRequest<"main", "user", "register">["details"];
type GetMeDetails = BackendActRequest<"main", "user", "getMe">["details"];

const userProjection: NonNullable<NonNullable<RegisterDetails["get"]>["user"]> = {
  _id: 1,
  username: 1,
  email: 1,
  displayName: 1,
  avatarUrl: 1,
};

export function login(
  set: LoginDetails["set"],
  options?: RequestOptions,
): Promise<AuthResponse> {
  const details: LoginDetails = { set, get: { token: 1, user: userProjection } };
  return callTypedAct<"main", "user", "login", AuthResponse>(
    { service: "main", model: "user", act: "login", details },
    options,
  );
}

export function register(
  set: RegisterDetails["set"],
  options?: RequestOptions,
): Promise<AuthResponse> {
  const details: RegisterDetails = { set, get: { token: 1, user: userProjection } };
  return callTypedAct<"main", "user", "register", AuthResponse>(
    { service: "main", model: "user", act: "register", details },
    options,
  );
}

export function getMe(options?: RequestOptions): Promise<AuthUser> {
  const details: GetMeDetails = {
    set: {},
    get: { _id: 1, username: 1, email: 1, displayName: 1, avatarUrl: 1, createdAt: 1, updatedAt: 1 },
  };
  return callTypedAct<"main", "user", "getMe", AuthUser>(
    { service: "main", model: "user", act: "getMe", details },
    options,
  );
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.username === "string" && typeof record.email === "string";
}

export async function getCachedUser(): Promise<AuthUser | null> {
  const raw = await LocalDBService.getSetting(CACHED_USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function cacheUser(user: AuthUser): Promise<void> {
  await LocalDBService.setSetting(CACHED_USER_KEY, JSON.stringify(user));
}

export async function clearCachedUser(): Promise<void> {
  await LocalDBService.setSetting(CACHED_USER_KEY, "");
}
