/**
 * Restoring a session is the first thing the app does, and it used to be the
 * one thing that required the network.
 *
 * The invariant these tests protect: a listener who is offline is still the
 * same listener. A saved token plus a cached profile is enough to open the
 * library and play downloaded audio; the server is asked in the background,
 * and only a server that explicitly rejects the token may sign anyone out.
 */

import { LesanError } from "@/lib/errors";
import * as AuthService from "@/services/AuthService";
import type { AuthUser } from "@/services/AuthService";
import * as SecureStore from "@/services/secureStore";
import { syncAll } from "@/services/SyncService";
import type { AuthStatus } from "@/store/authStore";
import { useAuthStore } from "@/store/authStore";

jest.mock("@/services/secureStore", () => ({
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
}));

jest.mock("@/services/AuthService", () => ({
  login: jest.fn(),
  register: jest.fn(),
  getMe: jest.fn(),
  getCachedUser: jest.fn(),
  cacheUser: jest.fn(),
  clearCachedUser: jest.fn(),
}));

jest.mock("@/services/SyncService", () => ({
  syncAll: jest.fn(async () => ({
    registered: 0,
    sessions: 0,
    annotations: 0,
    playlists: 0,
    contextPlays: 0,
    onlineCollections: 0,
    failed: 0,
  })),
}));

const getToken = jest.mocked(SecureStore.getToken);
const setToken = jest.mocked(SecureStore.setToken);
const clearToken = jest.mocked(SecureStore.clearToken);
const getMe = jest.mocked(AuthService.getMe);
const getCachedUser = jest.mocked(AuthService.getCachedUser);
const cacheUser = jest.mocked(AuthService.cacheUser);
const clearCachedUser = jest.mocked(AuthService.clearCachedUser);
const syncAllMock = jest.mocked(syncAll);

const user: AuthUser = {
  _id: "user-1",
  username: "sara",
  email: "sara@example.com",
  displayName: "Sara",
};

function setStatus(status: AuthStatus): void {
  useAuthStore.setState({
    status,
    user: null,
    token: null,
    error: null,
    isSubmitting: false,
  });
}

/** Lets the fire-and-forget identity refresh and sync settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.clearAllMocks();
  setStatus("loading");
  getToken.mockResolvedValue(null);
  getCachedUser.mockResolvedValue(null);
  cacheUser.mockResolvedValue(undefined);
  clearCachedUser.mockResolvedValue(undefined);
  clearToken.mockResolvedValue(undefined);
  setToken.mockResolvedValue(undefined);
});

describe("restore", () => {
  it("opens the app with the cached identity when the server is unreachable", async () => {
    getToken.mockResolvedValue("token-1");
    getCachedUser.mockResolvedValue(user);
    getMe.mockRejectedValue(new LesanError("Network request failed.", "offline"));

    await useAuthStore.getState().restore();
    await settle();

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual(user);
    expect(state.token).toBe("token-1");
    expect(clearToken).not.toHaveBeenCalled();
    expect(clearCachedUser).not.toHaveBeenCalled();
  });

  it("does not wait for the network before opening the app", async () => {
    getToken.mockResolvedValue("token-1");
    getCachedUser.mockResolvedValue(user);
    // A request that never answers stands in for a train tunnel.
    getMe.mockReturnValue(new Promise<AuthUser>(() => undefined));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("stays signed in offline even when no profile has been cached yet", async () => {
    getToken.mockResolvedValue("token-1");
    getCachedUser.mockResolvedValue(null);
    getMe.mockRejectedValue(new LesanError("Request timed out.", "timeout"));

    await useAuthStore.getState().restore();
    await settle();

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.token).toBe("token-1");
  });

  it("refreshes and caches the profile once the server answers", async () => {
    getToken.mockResolvedValue("token-1");
    getCachedUser.mockResolvedValue(user);
    getMe.mockResolvedValue({ ...user, displayName: "Sara A." });

    await useAuthStore.getState().restore();
    await settle();

    expect(cacheUser).toHaveBeenCalledWith({ ...user, displayName: "Sara A." });
    expect(useAuthStore.getState().user?.displayName).toBe("Sara A.");
  });

  it("signs out only when the server rejects the token", async () => {
    getToken.mockResolvedValue("expired");
    getCachedUser.mockResolvedValue(user);
    getMe.mockRejectedValue(new LesanError("API act returned an error.", "validation"));

    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().status).toBe("authenticated");

    await settle();

    const state = useAuthStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(clearToken).toHaveBeenCalled();
    expect(clearCachedUser).toHaveBeenCalled();
  });

  it("shows the login screen when there is no token", async () => {
    getToken.mockResolvedValue(null);

    await useAuthStore.getState().restore();
    await settle();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(getMe).not.toHaveBeenCalled();
  });
});

describe("login and logout", () => {
  it("caches the profile on login so the next offline launch knows who it is", async () => {
    jest.mocked(AuthService.login).mockResolvedValue({ token: "token-1", user });

    await useAuthStore.getState().login({ email: user.email, password: "secret" });
    await settle();

    expect(setToken).toHaveBeenCalledWith("token-1");
    expect(cacheUser).toHaveBeenCalledWith(user);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(syncAllMock).toHaveBeenCalled();
  });

  it("forgets the cached profile on logout", async () => {
    useAuthStore.setState({ status: "authenticated", user, token: "token-1" });

    await useAuthStore.getState().logout();

    expect(clearToken).toHaveBeenCalled();
    expect(clearCachedUser).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      status: "unauthenticated",
      user: null,
      token: null,
    });
  });
});
