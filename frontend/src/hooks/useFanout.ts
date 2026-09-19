import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "../types/api";
import { search } from "../api/endpoints";

export type SectionStatus = "idle" | "loading" | "results" | "empty" | "failed";

export interface SectionState {
  status: SectionStatus;
  results: SearchResult[];
  error: string | null;
}

export interface FanoutState {
  sections: Record<string, SectionState>;
  /** Retry a single provider's failed request. */
  retry: (plugin: string) => void;
  /** Abort every in-flight request (e.g. on unmount or a new query). */
  cancelAll: () => void;
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 8000;

interface Options {
  concurrency?: number;
  timeoutMs?: number;
}

function emptySection(status: SectionStatus = "loading"): SectionState {
  return { status, results: [], error: null };
}

/**
 * Client-side fan-out search across providers.
 *
 * Issues one `GET /api/v1/search` per provider with a concurrency cap and a
 * per-provider timeout (AbortController). Each provider settles independently:
 * loading -> results | empty | failed(+retry). A single provider failure never
 * rejects the whole hook.
 */
export function useFanout(
  plugins: string[],
  query: string,
  options: Options = {},
): FanoutState {
  const { concurrency = DEFAULT_CONCURRENCY, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const [rawSections, setSections] = useState<Record<string, SectionState>>(() => {
    const initial: Record<string, SectionState> = {};
    for (const plugin of plugins) initial[plugin] = emptySection("loading");
    return initial;
  });

  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationRef = useRef(0);

  // Stable key for the effect dependency (array identity would re-run the
  // effect on every render when callers pass an inline array literal).
  const pluginsKey = plugins.join("\u0000");

  const cancelAll = useCallback(() => {
    generationRef.current += 1;
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
  }, []);

  const runProvider = useCallback(
    async (plugin: string, generation: number) => {
      const controller = new AbortController();
      controllersRef.current.set(plugin, controller);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const results = await search(plugin, query, { signal: controller.signal });
        if (generation !== generationRef.current) return;
        setSections((prev) => ({
          ...prev,
          [plugin]: {
            status: results.length > 0 ? "results" : "empty",
            results,
            error: null,
          },
        }));
      } catch (error) {
        if (generation !== generationRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          setSections((prev) => ({
            ...prev,
            [plugin]: { status: "failed", results: [], error: "Timed out" },
          }));
          return;
        }
        setSections((prev) => ({
          ...prev,
          [plugin]: {
            status: "failed",
            results: [],
            error: error instanceof Error ? error.message : "Request failed",
          },
        }));
      } finally {
        clearTimeout(timeoutId);
        if (controllersRef.current.get(plugin) === controller) {
          controllersRef.current.delete(plugin);
        }
      }
    },
    [query, timeoutMs],
  );

  const start = useCallback(
    (pluginList: string[]) => {
      const generation = generationRef.current;
      setSections((prev) => {
        const next: Record<string, SectionState> = { ...prev };
        for (const plugin of pluginList) next[plugin] = emptySection("loading");
        return next;
      });

      let index = 0;
      const workers: Promise<void>[] = [];
      const worker = async () => {
        while (index < pluginList.length) {
          const plugin = pluginList[index++];
          await runProvider(plugin, generation);
        }
      };
      const workerCount = Math.max(1, Math.min(concurrency, pluginList.length));
      for (let i = 0; i < workerCount; i++) workers.push(worker());
      void Promise.all(workers);
    },
    [concurrency, runProvider],
  );

  useEffect(() => {
    if (!query.trim()) {
      generationRef.current += 1;
      setSections((prev) => {
        const next: Record<string, SectionState> = { ...prev };
        for (const plugin of plugins) next[plugin] = emptySection("idle");
        return next;
      });
      return;
    }
    start(plugins);
    return () => {
      for (const controller of controllersRef.current.values()) controller.abort();
      controllersRef.current.clear();
    };
  }, [pluginsKey, query, start]);
  const retry = useCallback(
    (plugin: string) => {
      if (!query.trim()) return;
      const generation = generationRef.current;
      setSections((prev) => ({ ...prev, [plugin]: emptySection("loading") }));
      void runProvider(plugin, generation);
    },
    [query, runProvider],
  );

  // Guarantee the sections contract before first render use: every plugin in
  // `plugins` has a SectionState even when the list grows after mount (e.g. a
  // `/app/?q=` deep link where `usePlugins` resolves one commit after the
  // initial `useState([])`). Without this, a consumer dereferencing
  // `sections[name]` on a fresh plugin would crash on `undefined`.
  const sections = useMemo(() => {
    const fallback = query.trim() ? emptySection("loading") : emptySection("idle");
    const merged: Record<string, SectionState> = { ...rawSections };
    for (const plugin of plugins) {
      if (!merged[plugin]) merged[plugin] = fallback;
    }
    return merged;
  }, [rawSections, pluginsKey, query]);

  return { sections, retry, cancelAll };
}
