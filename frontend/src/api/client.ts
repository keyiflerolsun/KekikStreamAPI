import type { ApiEnvelope, ApiErrorBody, ApiErrorShape } from "../types/api";
import { appendEncoded, type ParamValue } from "./token";

/**
 * Thin API wrapper — the single choke-point for all HTTP access to the
 * KekikStreamAPI. Rules encoded here (from the design doc):
 *
 *  1. Opaque tokens are passed as-is (see `token.ts`), never double-encoded.
 *  2. The `{with, result}` envelope is unwrapped centrally.
 *  3. Opaque `url` payloads are carried through untouched.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly shape: ApiErrorShape | null;
  readonly raw: unknown;

  constructor(body: ApiErrorBody) {
    const message = describeShape(body.shape, body.status);
    super(message);
    this.name = "ApiError";
    this.status = body.status;
    this.shape = body.shape;
    this.raw = body.raw;
  }
}

function describeShape(shape: ApiErrorShape | null, status: number): string {
  if (!shape) return `Request failed with status ${status}`;
  if ("hata" in shape) return shape.hata;
  if ("ups" in shape) return shape.ups;
  if ("detail" in shape) return shape.detail;
  if ("message" in shape) return shape.message;
  return `Request failed with status ${status}`;
}

function isErrorShape(value: unknown): value is ApiErrorShape {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.hata === "string" ||
    typeof obj.ups === "string" ||
    typeof obj.detail === "string" ||
    obj.success === false
  );
}

/** Map the documented statuses to a user-facing error. */
export function toApiError(status: number, raw: unknown): ApiError {
  const shape = isErrorShape(raw) ? raw : null;
  return new ApiError({ status, shape, raw });
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Perform a GET, unwrap the `{with, result}` envelope, and return `result`.
 * `params` values are appended verbatim (see `token.ts`), so pre-encoded
 * tokens and opaque JSON payloads are never re-encoded.
 */
export async function request<T>(
  path: string,
  params: Record<string, ParamValue> = {},
  options: RequestOptions = {},
): Promise<T> {
  const url = appendEncoded(path, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: options.signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError({
      status: 0,
      shape: null,
      raw: String(error),
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw toApiError(response.status, body);
  }

  if (body === null || typeof body !== "object") {
    return body as T;
  }

  const envelope = body as Partial<ApiEnvelope<T>>;
  if ("result" in envelope) {
    return envelope.result as T;
  }
  // Health / other non-envelope endpoints return a bare object.
  return body as T;
}
