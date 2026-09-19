import { useEffect, useState } from "react";
import type { PluginMeta } from "../types/api";
import { getAllPlugins } from "../api/endpoints";

interface UsePluginsResult {
  plugins: PluginMeta[];
  loading: boolean;
  error: string | null;
}

export function usePlugins(): UsePluginsResult {
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAllPlugins()
      .then((result) => {
        if (!active) return;
        setPlugins(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load plugins");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { plugins, loading, error };
}
