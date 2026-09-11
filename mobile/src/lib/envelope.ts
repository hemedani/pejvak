export type ApiSuccess<T> = {
  success: true;
  body: T;
};

export type ApiFailure = {
  success: false;
  body?: unknown;
  message?: string;
  error?: unknown;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(envelope: ApiEnvelope<T>): envelope is ApiSuccess<T> {
  return envelope.success === true;
}
