import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { ProviderSection } from "../components/ProviderSection";
import { useFanout } from "../hooks/useFanout";
import { usePlugins } from "../hooks/usePlugins";

export function HomePage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { plugins, loading, error } = usePlugins();
  const pluginNames = useMemo(() => plugins.map((plugin) => plugin.name), [plugins]);
  const { sections, retry } = useFanout(pluginNames, query);

  if (loading) {
    return (
      <div className="page">
        <SearchBar />
        <p>Loading providers…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <SearchBar />
        <p className="page-error" role="alert">{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <SearchBar />
      {query.trim() === "" ? (
        <p className="page-hint">
          Type a query to search across all providers. Results appear per site as
          they arrive.
        </p>
      ) : (
        <div className="fanout-results">
          {pluginNames.map((name) => (
            <ProviderSection
              key={name}
              site={name}
              state={sections[name]}
              onRetry={() => retry(name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
