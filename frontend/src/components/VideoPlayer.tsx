import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type PlayerState = "idle" | "loading" | "playing" | "error";

interface VideoPlayerProps {
  /** The stream-proxy URL (already rewritten through /api/v1/stream-proxy?t=...). */
  src: string;
  /** Whether the source is an HLS manifest (.m3u8). */
  isHls: boolean;
}

const CODEC_HINT =
  "This source may use a codec or container your browser cannot decode (for example HEVC/H.265 or Matroska). Try a different link.";

export function VideoPlayer({ src, isHls }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setState("loading");
    setError(null);

    // Tear down any prior HLS instance.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const onError = (event: Event) => {
      const element = event.target as HTMLVideoElement;
      const mediaError = element.error;
      if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError(`Could not play this stream. ${CODEC_HINT}`);
      } else {
        setError("Playback failed. Try a different link.");
      }
      setState("error");
    };

    video.addEventListener("error", onError);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`Could not play this stream. ${CODEC_HINT}`);
          setState("error");
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl") && isHls) {
      // Native HLS (Safari).
      video.src = src;
    } else {
      video.src = src;
    }

    const onPlaying = () => setState("playing");
    video.addEventListener("playing", onPlaying);

    return () => {
      video.removeEventListener("error", onError);
      video.removeEventListener("playing", onPlaying);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [src, isHls]);

  return (
    <div className="video-player">
      <video ref={videoRef} controls playsInline className="video-element" />
      {state === "loading" && <p className="player-status">Loading…</p>}
      {state === "error" && <p className="player-error" role="alert">{error}</p>}
    </div>
  );
}
