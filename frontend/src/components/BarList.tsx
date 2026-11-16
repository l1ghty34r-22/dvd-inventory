import type { NamedCount } from "../api";

interface Props {
  rows: NamedCount[];
  /** Noun for the hover text, e.g. "title" -> "Action: 12 titles". */
  unit: string;
  label: string;
}

/**
 * A single-series horizontal bar chart. Each row is labelled and its value printed, so it reads
 * as a table too; the bar only adds the sense of proportion.
 */
export function BarList({ rows, unit, label }: Props) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <ul className="bar-list" aria-label={label}>
      {rows.map((row) => {
        const text = `${row.name}: ${row.count} ${row.count === 1 ? unit : `${unit}s`}`;
        return (
          <li key={row.name} title={text}>
            <span className="bar-name">{row.name}</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="bar-value" aria-label={text}>
              {row.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
