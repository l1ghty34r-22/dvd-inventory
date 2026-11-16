import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../api";
import { AddDvdDialog } from "../components/AddDvdDialog";
import { DvdCase } from "../components/DvdCase";
import { StatTiles } from "../components/StatTiles";
import { TitleDetailsDialog } from "../components/TitleDetailsDialog";

export function CollectionTab() {
  const [search, setSearch] = useState("");
  // Which way the Add dialog opens: with the title search, or with the camera on.
  const [adding, setAdding] = useState<false | "search" | "scan">(false);
  const [openItemId, setOpenItemId] = useState<number | null>(null);

  const stats = useQuery({ queryKey: ["inventory", "stats"], queryFn: api.stats });
  const inventory = useQuery({
    queryKey: ["inventory", "list", search],
    queryFn: () => api.listInventory(search),
    placeholderData: (previous) => previous,
  });

  const shelfIsEmpty = stats.data?.total === 0;
  const items = inventory.data?.items ?? [];

  return (
    <>
      <div className="section-head">
        <div>
          <h1>My collection</h1>
          <p className="muted">Click a case to see the story, cast and your copy's details.</p>
        </div>
        <div className="section-actions">
          <button type="button" className="button secondary" onClick={() => setAdding("scan")}>
            Scan barcode
          </button>
          <button type="button" className="button primary" onClick={() => setAdding("search")}>
            Add a DVD
          </button>
        </div>
      </div>

      {stats.data && (
        <StatTiles
          tiles={[
            { label: "Discs on the shelf", value: stats.data.total },
            { label: "Films", value: stats.data.films },
            { label: "TV shows", value: stats.data.tv_shows },
            { label: "Added this month", value: stats.data.added_this_month },
          ]}
        />
      )}

      {shelfIsEmpty ? (
        <section className="empty">
          <div className="empty-ledge" aria-hidden="true" />
          <h2>Nothing on the shelf yet</h2>
          <p className="muted">
            Search for a film or TV show you own, or scan its barcode, and it goes straight on,
            cover and all.
          </p>
          <div className="empty-actions">
            <button type="button" className="button primary" onClick={() => setAdding("search")}>
              Add your first DVD
            </button>
            <button type="button" className="button secondary" onClick={() => setAdding("scan")}>
              Scan a barcode
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Find a title or barcode on your shelf"
              aria-label="Find a title or barcode on your shelf"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {inventory.isPending && <p className="muted">Loading your shelf…</p>}
          {inventory.isError && (
            <p className="error">Could not load your shelf: {inventory.error.message}</p>
          )}
          {inventory.data && items.length === 0 && search && (
            <p className="muted">Nothing on your shelf matches “{search}”.</p>
          )}

          <ul className="shelf">
            {items.map((item) => (
              <DvdCase key={item.id} item={item} onOpen={() => setOpenItemId(item.id)} />
            ))}
          </ul>

          {inventory.data && inventory.data.total > items.length && (
            <p className="muted">
              Showing {items.length} of {inventory.data.total}. Search to find the rest.
            </p>
          )}
        </>
      )}

      <AddDvdDialog
        open={adding !== false}
        startScanning={adding === "scan"}
        onClose={() => setAdding(false)}
      />
      <TitleDetailsDialog itemId={openItemId} onClose={() => setOpenItemId(null)} />
    </>
  );
}
