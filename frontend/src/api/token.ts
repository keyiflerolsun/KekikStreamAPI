// Token handling for the KekikStreamAPI contract.
//
// The API returns pre-encoded tokens (`quote_plus` applied server-side) in the
// `url` field of search/main-page/item responses. Those tokens must be appended
// to outgoing query strings VERBATIM — never re-encoded through
// `URLSearchParams` or an HTTP library's `params` option, which would
// double-encode `%3A` -> `%253A` and produce a 500.
//
// Some `url` values are not URLs at all (e.g. CanliTV returns a quote_plus'd
// JSON blob). They are opaque payloads: pass them through untouched.

/**
 * Query-string parameter value types.
 *
 * A `Raw` value is an opaque, already-encoded payload (pre-`quote_plus`'d
 * server tokens such as `search`/`load_item` `url` fields, and non-URL blobs).
 * It is appended byte-for-byte. A plain `string` is user text (e.g. the search
 * query) and MUST be percent-encoded so `&`/`#`/`=` do not split or truncate
 * the query string at the server.
 */
export type ParamValue = string | number | undefined | RawValue;

export interface RawValue {
  raw: string;
}

/** Mark a value as opaque/pre-encoded so `appendEncoded` passes it through. */
export function raw(value: string): RawValue {
  return { raw: value };
}

function encodeValue(value: string | number | RawValue): string {
  if (typeof value === "object" && value !== null && "raw" in value) {
    return value.raw;
  }
  return encodeURIComponent(String(value));
}

/** Build a query string by hand, encoding plain values but not pre-encoded ones. */
export function appendEncoded(
  base: string,
  params: Record<string, ParamValue>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeValue(value)}`);
  }
  if (parts.length === 0) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

export interface StreamTokenPayload {
  url: string;
  referer: string | null;
  userAgent: string | null;
}

/**
 * Produce the same urlsafe-base64 (no padding) JSON token the server's
 * stream-proxy reads. Payload keys are the compact `{u,r,a}` shape.
 */
export function encodeStreamToken(payload: StreamTokenPayload): string {
  const compact = {
    u: payload.url,
    r: payload.referer ?? null,
    a: payload.userAgent ?? null,
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
