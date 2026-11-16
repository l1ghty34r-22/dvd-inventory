export interface Tile {
  label: string;
  value: number | string;
}

/** A row of headline numbers. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="stat-tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className="stat-tile">
          <dt>{tile.label}</dt>
          <dd>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
