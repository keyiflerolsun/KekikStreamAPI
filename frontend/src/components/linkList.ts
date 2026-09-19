import type { LoadedLink } from "../types/api";

export interface GroupedLinks {
  host: string;
  links: LoadedLink[];
}

/** Group playable links by the host portion of their stream URL. */
export function groupByHost(links: LoadedLink[]): GroupedLinks[] {
  const groups = new Map<string, LoadedLink[]>();
  for (const link of links) {
    let host = "unknown";
    try {
      const parsed = new URL(link.url);
      host = parsed.hostname;
    } catch {
      host = "unknown";
    }
    const bucket = groups.get(host);
    if (bucket) bucket.push(link);
    else groups.set(host, [link]);
  }
  return Array.from(groups.entries()).map(([host, items]) => ({ host, links: items }));
}
