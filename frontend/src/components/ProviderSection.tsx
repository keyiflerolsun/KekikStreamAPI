import type { SectionState } from "../hooks/useFanout";
import { PosterCard } from "./PosterCard";
import type { SearchResult } from "../types/api";

interface ProviderSectionProps {
  site: string;
  state: SectionState;
  onRetry: () => void;
}

export function ProviderSection({ site, state, onRetry }: ProviderSectionProps) {
  return (
    <section className="provider-section" aria-label={site}>
      <header className="provider-section-header">
        <h2>{site}</h2>
        <span className={`section-badge section-badge--${state.status}`}>
          {state.status}
        </span>
      </header>
      <SectionBody site={site} state={state} onRetry={onRetry} />
    </section>
  );
}

function SectionBody({
  site,
  state,
  onRetry,
}: {
  site: string;
  state: SectionState;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "loading":
      return <SkeletonGrid />;
    case "empty":
      return <p className="section-empty">No results for this site.</p>;
    case "failed":
      return (
        <div className="section-failed">
          <p>{state.error ?? "This site could not be reached."}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
    case "results":
      return <ResultsGrid site={site} results={state.results} />;
    default:
      return null;
  }
}

function ResultsGrid({ site, results }: { site: string; results: SearchResult[] }) {
  return (
    <div className="poster-grid">
      {results.map((result) => (
        <PosterCard key={`${site}:${result.url}`} site={site} result={result} />
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="poster-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="skeleton-card" />
      ))}
    </div>
  );
}
