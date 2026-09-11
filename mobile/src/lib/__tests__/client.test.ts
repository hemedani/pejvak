import type { BackendActRequest } from "@/lib/backend-types";
import { callAct, setAuthToken } from "@/lib/client";
import { LesanError } from "@/lib/errors";

type FetchInit = {
  headers: Record<string, string>;
  signal?: AbortSignal;
};

type FetchCall = [string, FetchInit];

const jsonResponse = (payload: unknown) => ({ json: async () => payload });

const success = (body: unknown) => jsonResponse({ success: true, body });

function getMeRequest(): BackendActRequest<"main", "user", "getMe"> {
  return {
    service: "main",
    model: "user",
    act: "getMe",
    details: { set: {}, get: { _id: 1 } },
  };
}

describe("callAct", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setAuthToken(null);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("unwraps a successful envelope", async () => {
    fetchMock.mockResolvedValue(success({ ok: 1 }));

    const result = await callAct<"main", "user", "getMe", { ok: number }>(getMeRequest());

    expect(result).toEqual({ ok: 1 });
  });

  it("throws a LesanError when the envelope reports failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, body: { message: "nope" } }));

    await expect(callAct(getMeRequest())).rejects.toMatchObject({
      name: "LesanError",
      code: "validation",
    });
  });

  it("rejects a response that is not a Lesan envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));

    await expect(callAct(getMeRequest())).rejects.toBeInstanceOf(LesanError);
  });

  it("sends the stored token header without a Bearer prefix", async () => {
    fetchMock.mockResolvedValue(success({}));
    setAuthToken("jwt-123");

    await callAct(getMeRequest());

    const [, init] = fetchMock.mock.calls[0] as FetchCall;
    expect(init.headers.token).toBe("jwt-123");
  });

  it("converts an aborted request into a timeout error", async () => {
    fetchMock.mockImplementation((_url: string, init: FetchInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );

    await expect(callAct(getMeRequest(), { timeoutMs: 5 })).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
