import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ItemInfo, LoadedLink } from "../types/api";
import { loadItem, loadLinks, proxyUrlFor } from "../api/endpoints";
import { LinkList } from "../components/LinkList";
import { VideoPlayer } from "../components/VideoPlayer";
import { Poster } from "../components/Poster";
import { isSeries } from "../types/api";
import { detailPath } from "../router";

function isM3u8(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}

export function WatchPage() {
  const { site } = useParams<{ site: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("t") ?? "";

  const [item, setItem] = useState<ItemInfo | null>(null);
  const [links, setLinks] = useState<LoadedLink[]>([]);
  const [selected, setSelected] = useState<LoadedLink | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);

  useEffect(() => {
    if (!site || !token) return;
    let active = true;
    setItem(null);
    setLinks([]);
    setSelected(null);
    setItemError(null);
    loadItem(site, token)
      .then((result) => {
        if (active) setItem(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setItemError(err instanceof Error ? err.message : "Failed to load item");
        }
      });
    return () => {
      active = false;
    };
  }, [site, token]);

  useEffect(() => {
    if (!site || !token) return;
    let active = true;
    setLinksLoading(true);
    loadLinks(site, token)
      .then((result) => {
        if (!active) return;
        setLinks(result);
        if (result.length > 0) setSelected(result[0]);
      })
      .catch(() => {
        if (active) setLinks([]);
      })
      .finally(() => {
        if (active) setLinksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [site, token]);

  const episodes = useMemo(() => (item && isSeries(item) ? item.episodes : []), [item]);

  if (itemError) {
    return (
      <div className="page">
        <p className="page-error" role="alert">{itemError}</p>
      </div>
    );
  }

  return (
    <div className="page watch-page">
      <div className="watch-meta">
        {item && (
          <>
            <Poster
              src={item.poster}
              alt={item.title}
              className="watch-poster"
            />
            <div className="watch-info">
              <h1>{item.title}</h1>
              {item.year && <span className="watch-year">{item.year}</span>}
              {item.rating && <span className="watch-rating">★ {item.rating}</span>}
              {item.description && <p>{item.description}</p>}
            </div>
          </>
        )}
      </div>

      <div className="watch-content">
        <div className="watch-links">
          <h2>Playback links</h2>
          {linksLoading ? (
            <p>Loading links…</p>
          ) : (
            <LinkList
              links={links}
              selectedUrl={selected?.url ?? null}
              onSelect={setSelected}
            />
          )}
        </div>

        <div className="watch-player">
          {selected ? (
            <VideoPlayer src={proxyUrlFor(selected)} isHls={isM3u8(selected.url)} />
          ) : (
            <p>Select a link to start playback.</p>
          )}
        </div>
      </div>

      {episodes.length > 0 && (
        <div className="watch-episodes">
          <h2>Episodes</h2>
          <ul>
            {episodes.map((episode) => (
              <li key={episode.url}>
                <button
                  type="button"
                  className="episode-item"
                  onClick={() => site && navigate(detailPath(site, episode.url))}
                >
                  S{episode.season}E{episode.episode} — {episode.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
