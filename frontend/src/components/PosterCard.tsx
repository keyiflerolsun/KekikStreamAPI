import { Link } from "react-router-dom";
import type { SearchResult } from "../types/api";
import { Poster } from "./Poster";
import { detailPath } from "../router";

interface PosterCardProps {
  site: string;
  result: SearchResult;
}

export function PosterCard({ site, result }: PosterCardProps) {
  return (
    <Link to={detailPath(site, result.url)} className="poster-card">
      <Poster src={result.poster} alt={result.title} className="poster-card-image" />
      <span className="poster-card-title">{result.title}</span>
    </Link>
  );
}
