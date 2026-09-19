import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function SearchBar() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const navigate = useNavigate();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form className="search-bar" onSubmit={onSubmit} role="search">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search movies and series…"
        aria-label="Search query"
      />
      <button type="submit">Search</button>
    </form>
  );
}
