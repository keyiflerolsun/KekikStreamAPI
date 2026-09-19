import type { LoadedLink } from "../types/api";
import { groupByHost } from "./linkList";

interface LinkListProps {
  links: LoadedLink[];
  selectedUrl: string | null;
  onSelect: (link: LoadedLink) => void;
}

export function LinkList({ links, selectedUrl, onSelect }: LinkListProps) {
  if (links.length === 0) {
    return <p className="link-list-empty">No playable links were found.</p>;
  }

  const groups = groupByHost(links);

  return (
    <div className="link-list">
      {groups.map((group) => (
        <section key={group.host} className="link-group">
          <h3>{group.host}</h3>
          <ul>
            {group.links.map((link) => (
              <li key={link.url}>
                <button
                  type="button"
                  className={`link-item${link.url === selectedUrl ? " link-item--selected" : ""}`}
                  onClick={() => onSelect(link)}
                >
                  {link.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
