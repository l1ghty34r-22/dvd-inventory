import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api, ApiError } from "../api";
import type { MovieSearchResult } from "../api";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddDvdDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="add-dialog" onClose={onClose} aria-labelledby="add-dialog-title">
      {/* Mounted only while open, so the search starts fresh each time. */}
      {open && <AddDvdBody onClose={onClose} />}
    </dialog>
  );
}

function AddDvdBody({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState("");
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const query = useDebounced(term.trim(), 300);
  const search = useQuery({
    queryKey: ["movie-search", query],
    queryFn: () => api.searchMovies(query),
    enabled: query.length >= 2 && !manual,
    retry: false,
  });
  // 503 means the server has no TMDB key, so only typing the details in will work.
  const searchUnavailable = search.error instanceof ApiError && search.error.status === 503;
  const showManual = manual || searchUnavailable;

  const addItem = useMutation({
    mutationFn: api.addItem,
    onSuccess: (item) => {
      setLastAdded(item.movie.title);
      const tmdbId = item.movie.tmdb_id;
      if (tmdbId !== null) setAddedIds((ids) => [...ids, tmdbId]);
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  function addFromSearch(movie: MovieSearchResult) {
    addItem.mutate({
      title: movie.title,
      year: movie.year,
      tmdb_id: movie.tmdb_id,
      poster_url: movie.poster_url,
      location: location.trim() || null,
    });
  }

  function addManually(event: FormEvent) {
    event.preventDefault();
    addItem.mutate(
      { title: term.trim(), year: year ? Number(year) : null, location: location.trim() || null },
      {
        onSuccess: () => {
          setTerm("");
          setYear("");
        },
      },
    );
  }

  return (
    <>
      <header className="add-dialog-head">
        <h2 id="add-dialog-title">Add a DVD</h2>
        <button type="button" className="text-button" onClick={onClose}>
          Done
        </button>
      </header>

      <form
        className="add-dialog-fields"
        onSubmit={showManual ? addManually : (e: FormEvent) => e.preventDefault()}
      >
        <label>
          Film title
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={showManual ? "Title" : "Start typing a title"}
            autoFocus
            required
          />
        </label>
        {showManual && (
          <label>
            Year (optional)
            <input
              type="number"
              min={1880}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
        )}
        <label>
          Where you keep it (optional)
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Shelf A, the attic, on loan to Ana"
          />
        </label>
        {showManual && (
          <button type="submit" className="primary" disabled={addItem.isPending}>
            Add to shelf
          </button>
        )}
      </form>

      <div className="add-dialog-status" aria-live="polite">
        {addItem.isError && <p className="error">Could not add it: {addItem.error.message}</p>}
        {lastAdded && !addItem.isError && <p className="confirm">Added {lastAdded} to your shelf.</p>}
      </div>

      {searchUnavailable && (
        <p className="muted">
          Film search is switched off because the server has no TMDB key. Type the details in instead.
        </p>
      )}

      {!showManual && (
        <>
          {search.isFetching && <p className="muted">Searching…</p>}
          {search.isError && !searchUnavailable && (
            <p className="error">Film search failed: {search.error.message}. Try again in a moment.</p>
          )}
          {search.data && search.data.length === 0 && (
            <p className="muted">No films match “{query}”. Check the spelling, or add it by hand.</p>
          )}
          {search.data && search.data.length > 0 && (
            <ul className="results">
              {search.data.map((movie) => {
                const added = addedIds.includes(movie.tmdb_id);
                return (
                  <li key={movie.tmdb_id}>
                    {movie.poster_url ? (
                      <img src={movie.poster_url} alt="" loading="lazy" />
                    ) : (
                      <span className="results-noposter" />
                    )}
                    <span className="results-title">
                      <strong>{movie.title}</strong>
                      {movie.year && <span className="muted">{movie.year}</span>}
                    </span>
                    <button
                      type="button"
                      className={added ? "text-button" : "secondary"}
                      onClick={() => addFromSearch(movie)}
                      disabled={addItem.isPending}
                      aria-label={`Add ${movie.title}${movie.year ? ` (${movie.year})` : ""}`}
                    >
                      {added ? "Add another copy" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {!searchUnavailable && (
        <button type="button" className="text-button" onClick={() => setManual(!manual)}>
          {manual ? "Search for the film instead" : "Not listed? Add it by hand"}
        </button>
      )}
    </>
  );
}
