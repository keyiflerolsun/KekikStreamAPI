import type {
  HealthResponse,
  ItemInfo,
  LoadedLink,
  MainPageResult,
  PluginMeta,
  SearchResult,
} from "../types/api";
import { request } from "./client";
import { encodeStreamToken, raw, type StreamTokenPayload } from "./token";

const BASE = "/api/v1";

export function getPluginNames(options?: { signal?: AbortSignal }): Promise<string[]> {
  return request<string[]>(`${BASE}/get_plugin_names`, {}, options);
}

export function getAllPlugins(options?: { signal?: AbortSignal }): Promise<PluginMeta[]> {
  return request<PluginMeta[]>(`${BASE}/get_all_plugins`, {}, options);
}

export function getPlugin(plugin: string): Promise<PluginMeta> {
  return request<PluginMeta>(`${BASE}/get_plugin`, { plugin });
}

export function getMainPage(
  plugin: string,
  page = 1,
  options?: { signal?: AbortSignal },
): Promise<MainPageResult[]> {
  return request<MainPageResult[]>(`${BASE}/get_main_page`, { plugin, page }, options);
}

export function search(
  plugin: string,
  query: string,
  options?: { signal?: AbortSignal },
): Promise<SearchResult[]> {
  return request<SearchResult[]>(`${BASE}/search`, { plugin, query }, options);
}

export function loadItem(
  plugin: string,
  encodedUrl: string,
  options?: { signal?: AbortSignal },
): Promise<ItemInfo> {
  // `encodedUrl` is a pre-encoded token: appended verbatim by `request`.
  return request<ItemInfo>(`${BASE}/load_item`, { plugin, encoded_url: raw(encodedUrl) }, options);
}

export function loadLinks(
  plugin: string,
  encodedUrl: string,
  options?: { signal?: AbortSignal },
): Promise<LoadedLink[]> {
  return request<LoadedLink[]>(`${BASE}/load_links`, { plugin, encoded_url: raw(encodedUrl) }, options);
}

/** Build a `/api/v1/stream-proxy?t=...` URL for a given playback link. */
export function streamProxyUrl(payload: StreamTokenPayload): string {
  const token = encodeStreamToken(payload);
  return `${BASE}/stream-proxy?t=${token}`;
}

/** Adapt a `LoadedLink` to its stream-proxy URL. */
export function proxyUrlFor(link: LoadedLink): string {
  return streamProxyUrl({
    url: link.url,
    referer: link.referer,
    userAgent: link.user_agent,
  });
}

export function health(options?: { signal?: AbortSignal }): Promise<HealthResponse> {
  return request<HealthResponse>(`${BASE}/health`, {}, options);
}
