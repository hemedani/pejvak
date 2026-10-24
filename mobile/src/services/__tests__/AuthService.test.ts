import type { AuthUser } from "@/services/AuthService";
import { cacheUser, clearCachedUser, getCachedUser } from "@/services/AuthService";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getSetting: jest.fn(),
    setSetting: jest.fn(),
  },
}));

const getSetting = jest.mocked(LocalDBService.getSetting);
const setSetting = jest.mocked(LocalDBService.setSetting);

const user: AuthUser = {
  _id: "user-1",
  username: "sara",
  email: "sara@example.com",
  displayName: "Sara",
};

beforeEach(() => jest.clearAllMocks());

describe("cached identity", () => {
  it("returns nothing when no profile has been stored", async () => {
    getSetting.mockResolvedValue(null);
    expect(await getCachedUser()).toBeNull();
  });

  it("round-trips the confirmed profile", async () => {
    getSetting.mockResolvedValue(JSON.stringify(user));
    expect(await getCachedUser()).toEqual(user);
  });

  it("ignores a malformed or unrecognisable entry instead of failing the launch", async () => {
    getSetting.mockResolvedValue("{not json");
    expect(await getCachedUser()).toBeNull();

    getSetting.mockResolvedValue(JSON.stringify({ displayName: "No email" }));
    expect(await getCachedUser()).toBeNull();
  });

  it("writes the profile as JSON under the identity key", async () => {
    await cacheUser(user);
    expect(setSetting).toHaveBeenCalledWith("auth.cachedUser", JSON.stringify(user));
  });

  it("empties the entry on sign-out", async () => {
    await clearCachedUser();
    expect(setSetting).toHaveBeenCalledWith("auth.cachedUser", "");
  });
});
