import type { CSSProperties } from "react";

import type { InventoryItem } from "../api";

/** A stable hue per title, so films without a poster still get their own cover colour. */
export function hueFor(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function CaseCover({ title, posterUrl }: { title: string; posterUrl: string | null }) {
  return posterUrl ? (
    <img src={posterUrl} alt="" loading="lazy" />
  ) : (
    <div className="case-blank" style={{ "--hue": hueFor(title) } as CSSProperties}>
      {title}
    </div>
  );
}

interface Props {
  item: InventoryItem;
  onOpen: () => void;
}

/** One disc standing on the shelf. The whole case is a button that opens its details. */
export function DvdCase({ item, onOpen }: Props) {
  const { movie } = item;
  const kind = movie.media_type === "tv" ? "TV series" : null;
  const details = [movie.year, kind].filter(Boolean).join(" · ");

  return (
    <li className="slot">
      <button
        type="button"
        className="slot-button"
        onClick={onOpen}
        aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ""}: show details`}
      >
        <span className="slot-ledge">
          <span className="case">
            <CaseCover title={movie.title} posterUrl={movie.poster_url} />
          </span>
        </span>
        <span className="slot-label">
          <strong>{movie.title}</strong>
          {details && <span className="muted">{details}</span>}
        </span>
      </button>
    </li>
  );
}
