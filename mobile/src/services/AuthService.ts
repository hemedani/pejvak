import type { BackendActRequest } from "@/lib/backend-types";
import { callTypedAct, type RequestOptions } from "@/lib/client";

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

const userProjection: NonNullable<RegisterDetails["get"]>["user"] = {
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
