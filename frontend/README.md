# KekikStream SPA (frontend)

React + Vite + TypeScript single-page application that fronts the
KekikStreamAPI. It fans out search across all providers client-side and plays
streams in-browser through the server's `/api/v1/stream-proxy`.

## Requirements

- **Node.js >= 20** (built and tested with v22.x)
- **pnpm >= 10** (lockfile pinned to `pnpm@10.34.5`)

## Install

```bash
pnpm install --frozen-lockfile
```

If `pnpm` is unavailable, `npm install` works as a fallback (a
`package-lock.json` is not committed; see `package.json` for the dependency set).

## Commands

```bash
pnpm dev          # Vite dev server on :5173, proxying /api -> 127.0.0.1:3310
pnpm build        # typecheck + production build -> ../Public/App
pnpm preview      # serve the production build locally
pnpm test         # Vitest (offline, deterministic)
pnpm typecheck    # tsc --noEmit
```

## Structure

```
src/
├── api/            # thin wrapper (single HTTP choke-point)
│   ├── client.ts   #   envelope unwrap + error mapping
│   ├── token.ts    #   pre-encoded token handling, stream token codec
│   └── endpoints.ts#   typed endpoint functions
├── hooks/          # useFanout (fan-out search), usePlugins, useMediaQuery
├── components/     # SearchBar, ProviderSection, PosterCard, LinkList, VideoPlayer
├── pages/          # HomePage (search), WatchPage (detail + player)
├── types/api.ts    # TS mirrors of the API JSON surface
├── router.tsx      # client-side routes (basename = /app/)
└── styles.css
```

## Notes

- Search/detail tokens are **pre-encoded** by the API and must be passed through
  verbatim; `token.ts` builds query strings manually and never re-encodes.
- Playback always goes through `GET /api/v1/stream-proxy?t=...`; the token
  carries the stream URL, referer, and user agent.
- Built output is committed at `../Public/App/` (served by the API at `/app/`).
