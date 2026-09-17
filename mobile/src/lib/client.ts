import { env } from "@/constants/env";
import type { BackendActRequest, BackendRequest } from "@/lib/backend-types";
import { isApiSuccess, type ApiEnvelope } from "@/lib/envelope";
import { LesanError } from "@/lib/errors";
import { lesanApi } from "@/lib/generated/selectInp";

const DEFAULT_TIMEOUT_MS = 15_000;

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export type RequestOptions = {
  token?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Did the request fail before any response arrived?
 *
 * `expo` replaces the global `fetch` with its own native-backed implementation
 * (`expo/src/winter/runtime.native.ts` installs `expo/fetch` unless
 * `EXPO_PUBLIC_USE_RN_FETCH` is set). That one rejects with a `FetchError` which
 * *extends `Error`*, not React Native's `TypeError` — so an `instanceof TypeError`
 * check alone misses every genuine network failure, and they all fall through to
 * `unknown`, which the UI reports as "Something unexpected went wrong." That is the
 * exact message an unreachable or misconfigured server used to produce.
 *
 * Matched by message because `FetchError` is not re-exported from the public
 * `expo/fetch` entry point. Both shapes are pinned in `__tests__/client.test.ts`.
 */
function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  // Tested against `error.message`, not the `name: message` form that
  // `errorMessage()` builds — `FetchError` does not set `name`, so it reads as a
  // plain `Error` and an anchored pattern would never match.
  return error instanceof Error && /fetch failed:/i.test(error.message);
}

function classifyTransportFailure(error: unknown, timedOut: boolean): LesanError {
  if (error instanceof LesanError) {
    return error;
  }
  if (timedOut) {
    return new LesanError("Request timed out.", "timeout");
  }
  const message = errorMessage(error);
  if (/cancel|abort/i.test(message)) {
    return new LesanError("Request was cancelled.", "cancelled", undefined, message);
  }
  if (error instanceof SyntaxError || /json parse|unexpected end of input/i.test(message)) {
    return new LesanError("Response was incomplete.", "invalid_response", undefined, message);
  }
  if (isNetworkFailure(error)) {
    return new LesanError("Network request failed.", "offline", undefined, message);
  }
  return new LesanError("Unexpected request failure.", "unknown", undefined, error);
}

function parseEnvelope<T>(value: unknown): ApiEnvelope<T> {
  if (!value || typeof value !== "object" || !("success" in value)) {
    throw new LesanError("Invalid API response envelope.", "invalid_response");
  }
  return value as ApiEnvelope<T>;
}

let lastDevWarning: string | null = null;

function logDevelopmentFailure(error: unknown): void {
  if (!env.isDev) {
    return;
  }
  const fingerprint = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  if (fingerprint === lastDevWarning) {
    return;
  }
  lastDevWarning = fingerprint;
  if (error instanceof LesanError) {
    // `url` is the base URL the bundle was compiled with. It is inlined at build
    // time and cannot change at runtime, so "which server is this build actually
    // talking to?" is answerable only from here — otherwise the only record is the
    // EAS build log.
    console.warn("[lesan]", {
      url: env.lesanUrl,
      code: error.code,
      status: error.status,
      details: error.details,
    });
    return;
  }
  console.warn("[lesan] unexpected failure", error);
}

export async function callAct<
  TService extends keyof BackendRequest,
  TModel extends keyof BackendRequest[TService],
  TAct extends keyof BackendRequest[TService][TModel],
  TResponse,
>(
  request: BackendActRequest<TService, TModel, TAct>,
  options: RequestOptions = {},
): Promise<TResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const token = options.token ?? authToken;

  try {
    let payload: unknown;
    try {
      const transport = lesanApi({
        URL: env.lesanUrl,
        settings: { signal: controller.signal },
        baseHeaders: {
          Accept: "application/json",
          ...(token ? { token } : {}),
        },
      });
      // The generated transport infers one generic body shape per call, while
      // `BackendActRequest` is already narrowed to a single act. Bridge the two.
      const body = request as unknown as Parameters<typeof transport.send>[0];
      payload = await transport.send(body);
    } catch (error) {
      throw classifyTransportFailure(error, timedOut);
    }

    const envelope = parseEnvelope<TResponse>(payload);
    if (!isApiSuccess(envelope)) {
      throw new LesanError(
        "API act returned an error.",
        "validation",
        undefined,
        envelope.body ?? envelope.error,
      );
    }
    return envelope.body;
  } catch (error) {
    logDevelopmentFailure(error);
    if (error instanceof LesanError) {
      throw error;
    }
    throw classifyTransportFailure(error, timedOut);
  } finally {
    clearTimeout(timeout);
  }
}

export function callTypedAct<
  TService extends keyof BackendRequest,
  TModel extends keyof BackendRequest[TService],
  TAct extends keyof BackendRequest[TService][TModel],
  TResponse,
>(request: BackendActRequest<TService, TModel, TAct>, options: RequestOptions = {}): Promise<TResponse> {
  return callAct<TService, TModel, TAct, TResponse>(request, options);
}
