export type LesanErrorCode =
  | "offline"
  | "timeout"
  | "cancelled"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "server"
  | "invalid_response"
  | "unknown";

export class LesanError extends Error {
  constructor(
    message: string,
    public readonly code: LesanErrorCode,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LesanError";
  }
}
