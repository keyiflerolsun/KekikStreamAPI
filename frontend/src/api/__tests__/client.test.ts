import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appendEncoded, encodeStreamToken, raw } from "../token";
import { request, ApiError, toApiError } from "../client";

describe("appendEncoded", () => {
  it("percent-encodes plain user text (&, #, =)", () => {
    const url = appendEncoded("/api/v1/search", {
      plugin: "AnimeciX",
      query: "Myth & Reality #2 = C#",
    });
    expect(url).toBe(
      "/api/v1/search?plugin=AnimeciX&query=Myth%20%26%20Reality%20%232%20%3D%20C%23",
    );
  });

  it("appends values verbatim without re-encoding", () => {
    const url = appendEncoded("/api/v1/search", {
      plugin: "AnimeciX",
      query: "vikings",
    });
    expect(url).toBe("/api/v1/search?plugin=AnimeciX&query=vikings");
  });

  it("does not double-encode a pre-encoded token", () => {
    const token = "https%3A%2F%2Fexample.com%2Fitem%3Fid%3D42";
    const url = appendEncoded("/api/v1/load_item", {
      plugin: "AnimeciX",
      encoded_url: raw(token),
    });
    expect(url).toBe(`/api/v1/load_item?plugin=AnimeciX&encoded_url=${token}`);
    expect(url).not.toContain("%253A");
  });

  it("carries an opaque JSON payload through untouched", () => {
    const blob = "%7B%22channel%22%3A%22trt1%22%7D";
    const url = appendEncoded("/api/v1/load_links", {
      plugin: "CanliTV",
      encoded_url: raw(blob),
    });
    expect(url).toContain(blob);
    expect(url).not.toContain("%257B");
  });

  it("skips undefined values", () => {
    const url = appendEncoded("/api/v1/search", { plugin: "X", query: undefined });
    expect(url).toBe("/api/v1/search?plugin=X");
  });
});

describe("encodeStreamToken", () => {
  it("produces urlsafe base64 without padding", () => {
    const token = encodeStreamToken({
      url: "https://example.com/a.m3u8",
      referer: "https://example.com",
      userAgent: null,
    });
    expect(token).not.toMatch(/[+/]/);
    expect(token).not.toMatch(/=+$/);
    const decoded = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded).toEqual({ u: "https://example.com/a.m3u8", r: "https://example.com", a: null });
  });

  it("round-trips an opaque CanliTV-style blob", () => {
    const payload = { u: '{"channel":"trt1"}', r: null, a: "UA/1.0" };
    const token = encodeStreamToken({
      url: payload.u,
      referer: payload.r,
      userAgent: payload.a,
    });
    const decoded = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded).toEqual(payload);
  });
});

describe("request (envelope unwrapping)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }

  it("unwraps the {with, result} envelope", async () => {
    mockFetch(200, { with: "https://github.com/x", result: ["a", "b"] });
    const result = await request<string[]>("/api/v1/get_plugin_names");
    expect(result).toEqual(["a", "b"]);
  });

  it("passes a pre-encoded token to fetch unchanged", async () => {
    mockFetch(200, { with: "https://github.com/x", result: {} });
    const token = "https%3A%2F%2Fexample.com%2Fitem";
    await request("/api/v1/load_item", { plugin: "X", encoded_url: raw(token) });
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toBe(`/api/v1/load_item?plugin=X&encoded_url=${token}`);
    expect(callUrl).not.toContain("%253A");
  });

  it("encodes a plain user query before sending to fetch", async () => {
    mockFetch(200, { with: "https://github.com/x", result: [] });
    await request("/api/v1/search", { plugin: "X", query: "Myth & Reality #2" });
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toBe("/api/v1/search?plugin=X&query=Myth%20%26%20Reality%20%232");
  });

  it("maps the 410 'hata' error shape to a typed ApiError", async () => {
    mockFetch(410, { hata: "/api/v1/search?plugin=X&query=" });
    await expect(request("/api/v1/search", { plugin: "X" })).rejects.toThrow(ApiError);
    try {
      await request("/api/v1/search", { plugin: "X" });
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(410);
      expect(apiError.message).toBe("/api/v1/search?plugin=X&query=");
    }
  });

  it("maps the 500 'ups' shape", async () => {
    mockFetch(500, { ups: "Sunucu Hatası.." });
    await expect(request("/api/v1/search", { plugin: "X", query: "q" })).rejects.toMatchObject({
      status: 500,
    });
  });

  it("returns a bare non-envelope object as-is (health)", async () => {
    mockFetch(200, { success: true, status: "healthy" });
    const result = await request<{ success: boolean }>("/api/v1/health");
    expect(result).toEqual({ success: true, status: "healthy" });
  });

  it("constructs an ApiError for non-object error bodies", () => {
    const error = toApiError(404, "Not Found");
    expect(error.status).toBe(404);
    expect(error.shape).toBeNull();
  });
});
