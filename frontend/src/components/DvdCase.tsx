import type { CSSProperties } from "react";

import type { InventoryItem } from "../api";

/** A stable hue per title, so films without a poster still get their own cover colour. */
function hueFor(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

interface Props {
  item: InventoryItem;
  onRemove: (id: number) => void;
  removing: boolean;
}

export function DvdCase({ item, onRemove, removing }: Props) {
  const { movie } = item;
  const details = [movie.year, movie.media_type === "tv" && "TV series", item.location]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="slot">
      <div className="slot-ledge">
        <div className="case">
          {movie.poster_url ? (
            <img src={movie.poster_url} alt="" loading="lazy" />
          ) : (
            <div
              className="case-blank"
              style={{ "--hue": hueFor(movie.title) } as CSSProperties}
            >
              {movie.title}
            </div>
          )}
        </div>
      </div>
      <div className="slot-label">
        <strong>{movie.title}</strong>
        {details && <span className="muted">{details}</span>}
        <button
          type="button"
          className="text-button"
          onClick={() => onRemove(item.id)}
          disabled={removing}
          aria-label={`Remove ${movie.title}`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
