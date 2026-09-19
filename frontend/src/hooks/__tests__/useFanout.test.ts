import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFanout } from "../useFanout";
import { search } from "../../api/endpoints";

vi.mock("../../api/endpoints", () => ({
  search: vi.fn(),
}));

const mockedSearch = vi.mocked(search);

const PLUGINS = ["A", "B", "C", "D", "E", "F", "G", "H"];

describe("useFanout", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
  });

  it("caps in-flight requests at the concurrency limit", async () => {
    let inflight = 0;
    let maxInflight = 0;
    let started = 0;

    mockedSearch.mockImplementation((_plugin: string) => {
      started += 1;
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      return Promise.resolve([] as never).finally(() => {
        inflight -= 1;
      });
    });

    renderHook(() => useFanout(PLUGINS, "q", { concurrency: 3, timeoutMs: 60_000 }));

    await waitFor(() => expect(started).toBe(PLUGINS.length));
    expect(maxInflight).toBeLessThanOrEqual(3);
  });

  it("times out a slow provider and marks it failed", async () => {
    mockedSearch.mockImplementation((plugin: string, _query, options) => {
      if (plugin === "A") {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      return Promise.resolve([{ title: plugin, url: "u", poster: null }]);
    });

    const { result } = renderHook(() =>
      useFanout(["A", "B"], "q", { concurrency: 6, timeoutMs: 60 }),
    );

    await waitFor(() => expect(result.current.sections.A.status).toBe("failed"), {
      timeout: 3000,
    });
    expect(result.current.sections.B.status).toBe("results");
  });

  it("isolates a single provider failure", async () => {
    mockedSearch.mockImplementation((plugin: string) => {
      if (plugin === "C") return Promise.reject(new Error("boom"));
      return Promise.resolve([{ title: plugin, url: "u", poster: null }]);
    });

    const { result } = renderHook(() =>
      useFanout(["A", "B", "C"], "q", { concurrency: 6, timeoutMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.sections.A.status).toBe("results"));
    await waitFor(() => expect(result.current.sections.B.status).toBe("results"));
    await waitFor(() => expect(result.current.sections.C.status).toBe("failed"));
    expect(result.current.sections.C.error).toBe("boom");
  });

  it("marks a provider empty when it returns no results", async () => {
    mockedSearch.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useFanout(["A"], "q", { concurrency: 6, timeoutMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.sections.A.status).toBe("empty"));
  });

  it("retries a single failed provider", async () => {
    let aCalls = 0;
    mockedSearch.mockImplementation((plugin: string) => {
      if (plugin === "A") {
        aCalls += 1;
        if (aCalls === 1) return Promise.reject(new Error("first"));
        return Promise.resolve([{ title: "ok", url: "u", poster: null }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() =>
      useFanout(["A", "B"], "q", { concurrency: 6, timeoutMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.sections.A.status).toBe("failed"));

    await act(async () => {
      result.current.retry("A");
    });

    await waitFor(() => expect(result.current.sections.A.status).toBe("results"));
  });

  it("aborts in-flight requests on unmount", async () => {
    const abortSpy = vi.fn();
    mockedSearch.mockImplementation((_plugin, _query, options) => {
      options?.signal?.addEventListener("abort", abortSpy);
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() =>
      useFanout(["A"], "q", { concurrency: 6, timeoutMs: 60_000 }),
    );

    await waitFor(() => expect(mockedSearch).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(abortSpy).toHaveBeenCalled());
  });

  it("passes a real AbortSignal to the search call", async () => {
    mockedSearch.mockResolvedValue([]);

    renderHook(() => useFanout(["A"], "q", { concurrency: 6, timeoutMs: 60_000 }));

    await waitFor(() => expect(mockedSearch).toHaveBeenCalled());
    const options = mockedSearch.mock.calls[0][2];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("guarantees a SectionState for plugins that grow after mount with an active query", async () => {
    mockedSearch.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ plugins }) => useFanout(plugins, "q", { concurrency: 6, timeoutMs: 60_000 }),
      { initialProps: { plugins: [] as string[] } },
    );

    // First render with an empty plugin list establishes no sections.
    expect(result.current.sections).toEqual({});

    // The plugin list then resolves (deep-link `/app/?q=` refresh): the hook
    // must expose a SectionState for every plugin immediately, before the
    // fan-out requests settle, so consumers never dereference `undefined`.
    rerender({ plugins: ["A", "B"] });

    expect(result.current.sections.A).toBeDefined();
    expect(result.current.sections.B).toBeDefined();
    expect(result.current.sections.A.status).toBe("loading");

    await waitFor(() => expect(result.current.sections.A.status).toBe("empty"));
  });
});
