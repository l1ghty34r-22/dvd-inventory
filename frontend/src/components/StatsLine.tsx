import type { InventoryStats } from "../api";

/** The collection summed up as a sentence or two, rather than a row of number tiles. */
export function StatsLine({ stats }: { stats: InventoryStats }) {
  const parts: string[] = [];

  parts.push(`${stats.total} ${stats.total === 1 ? "DVD" : "DVDs"} on your shelf.`);
  if (stats.added_this_month > 0) parts.push(`${stats.added_this_month} added this month.`);
  if (stats.top_genre) parts.push(`Mostly ${stats.top_genre}.`);
  if (stats.oldest && stats.newest && stats.oldest.year !== stats.newest.year) {
    parts.push(
      `From ${stats.oldest.title} (${stats.oldest.year}) to ${stats.newest.title} (${stats.newest.year}).`,
    );
  }

  return <p className="stats-line">{parts.join(" ")}</p>;
}
