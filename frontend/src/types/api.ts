// TypeScript mirrors of the KekikStreamAPI JSON surface.
// Every JSON body except health is `{ "with": string, "result": ... }`.

export interface ApiEnvelope<T> {
  with: string;
  result: T;
}

export interface HealthResponse {
  success: boolean;
  status: string;
}

export interface SearchResult {
  title: string;
  url: string;
  poster: string | null;
}

export interface MainPageResult {
  category: string;
  title: string;
  url: string;
  poster: string | null;
}

export interface PluginMeta {
  name: string;
  language: string;
  main_url: string;
  favicon: string;
  description: string;
  main_page: string;
}

export interface Episode {
  season: number;
  episode: number;
  title: string;
  url: string;
}

export interface Subtitle {
  name: string;
  url: string;
}

export interface LoadedLink {
  name: string;
  url: string;
  referer: string | null;
  user_agent: string | null;
  subtitles: Subtitle[];
}

interface MetadataInfo {
  url: string | null;
  poster: string | null;
  title: string;
  description: string | null;
  tags: string[] | null;
  rating: string | null;
  year: string | null;
  actors: string[] | null;
  duration: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
}

export interface MovieInfo extends MetadataInfo {
  episodes?: never;
}

export interface SeriesInfo extends MetadataInfo {
  episodes: Episode[];
}

export type ItemInfo = MovieInfo | SeriesInfo;

export function isSeries(info: ItemInfo): info is SeriesInfo {
  return Array.isArray((info as SeriesInfo).episodes);
}

// Error shapes documented by the API surface report.
export type ApiErrorShape =
  | { hata: string }
  | { ups: string }
  | { success: false; message: string }
  | { detail: string };

export interface ApiErrorBody {
  status: number;
  shape: ApiErrorShape | null;
  raw: unknown;
}
