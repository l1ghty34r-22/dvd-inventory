import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../api";
import { useAuth } from "../auth";
import { AddDvdDialog } from "../components/AddDvdDialog";
import { DvdCase } from "../components/DvdCase";
import { StatsLine } from "../components/StatsLine";

export function InventoryPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const stats = useQuery({ queryKey: ["inventory", "stats"], queryFn: api.stats });
  const inventory = useQuery({
    queryKey: ["inventory", "list", search],
    queryFn: () => api.listInventory(search),
    placeholderData: (previous) => previous,
  });

  const removeItem = useMutation({
    mutationFn: api.deleteItem,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const shelfIsEmpty = stats.data?.total === 0;
  const items = inventory.data?.items ?? [];

  return (
    <div className="page">
      <header className="topbar">
        <h1>Your shelf</h1>
        <div className="topbar-account">
          <span className="muted">{user?.email}</span>
          <button type="button" className="text-button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        {shelfIsEmpty ? (
          <section className="empty">
            <div className="empty-ledge" aria-hidden="true" />
            <h2>Nothing on the shelf yet</h2>
            <p className="muted">
              Search for a film or TV show you own, or scan its barcode, and it goes straight on,
              cover and all.
            </p>
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              Add your first DVD
            </button>
          </section>
        ) : (
          <>
            {stats.data && <StatsLine stats={stats.data} />}

            <div className="toolbar">
              <input
                type="search"
                placeholder="Find a title or barcode on your shelf"
                aria-label="Find a title or barcode on your shelf"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="primary" onClick={() => setAdding(true)}>
                Add a DVD
              </button>
            </div>

            {inventory.isPending && <p className="muted">Loading your shelf…</p>}
            {inventory.isError && (
              <p className="error">Could not load your shelf: {inventory.error.message}</p>
            )}
            {removeItem.isError && (
              <p className="error">Could not remove it: {removeItem.error.message}</p>
            )}
            {inventory.data && items.length === 0 && search && (
              <p className="muted">Nothing on your shelf matches “{search}”.</p>
            )}

            <ul className="shelf">
              {items.map((item) => (
                <DvdCase
                  key={item.id}
                  item={item}
                  onRemove={removeItem.mutate}
                  removing={removeItem.isPending}
                />
              ))}
            </ul>

            {inventory.data && inventory.data.total > items.length && (
              <p className="muted">
                Showing {items.length} of {inventory.data.total}. Search to find the rest.
              </p>
            )}
          </>
        )}
      </main>

      <footer className="footnote">
        Film and TV details and covers come from TMDB. This product uses the TMDB API but is not endorsed
        or certified by TMDB.
      </footer>

      <AddDvdDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
