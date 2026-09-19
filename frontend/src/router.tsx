import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { WatchPage } from "./pages/WatchPage";

/**
 * Client-side routes. Tokens are opaque and may be non-URL payloads, so they
 * live in the query string, never a path segment. Route paths themselves carry
 * only the provider name.
 */
export function detailPath(site: string, token: string): string {
  return `/watch/${encodeURIComponent(site)}?t=${encodeURIComponent(token)}`;
}

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/watch/:site", element: <WatchPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
