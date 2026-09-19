import { useState } from "react";

const PLACEHOLDER = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#1c2733"/><text x="50%" y="50%" fill="#5b6b7d" font-family="sans-serif" font-size="20" text-anchor="middle">No poster</text></svg>`,
);

export const POSTER_PLACEHOLDER = `data:image/svg+xml,${PLACEHOLDER}`;

interface PosterProps {
  src: string | null;
  alt: string;
  className?: string;
}

export function Poster({ src, alt, className }: PosterProps) {
  const [failed, setFailed] = useState(false);

  return (
    <img
      className={className}
      src={!src || failed ? POSTER_PLACEHOLDER : src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
