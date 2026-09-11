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
  if (error instanceof TypeError) {
    return new LesanError("Network request failed.", "offline");
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
    console.warn("[lesan]", {
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
