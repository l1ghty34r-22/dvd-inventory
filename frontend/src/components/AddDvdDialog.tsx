import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api, ApiError } from "../api";
import type { BarcodeLookup, Movie, MovieSearchResult } from "../api";
import { BarcodeScanner } from "./BarcodeScanner";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const kindLabel = (mediaType: Movie["media_type"]) => (mediaType === "tv" ? "TV series" : "Film");
const resultKey = (r: { media_type: string; tmdb_id: number | null }) => `${r.media_type}:${r.tmdb_id}`;

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
      {/* Mounted only while open, so the search starts fresh and the camera turns off on close. */}
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
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [typedBarcode, setTypedBarcode] = useState("");
  // The barcode that will be saved with the next title added.
  const [scan, setScan] = useState<BarcodeLookup | null>(null);

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

  const lookup = useMutation({
    mutationFn: api.lookupBarcode,
    onSuccess: (info) => {
      setScan(info);
      setTypedBarcode("");
      setLastAdded(null);
      if (info.title_guess) setTerm(info.title_guess);
    },
  });

  const addItem = useMutation({
    mutationFn: api.addItem,
    onSuccess: (item) => {
      setLastAdded(item.movie.title);
      setAddedKeys((keys) => [...keys, resultKey(item.movie)]);
      // A barcode belongs to one disc, so do not carry it over to the next title.
      setScan(null);
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const barcode = scan?.barcode ?? null;

  function addFromSearch(movie: MovieSearchResult | Movie) {
    addItem.mutate({
      title: movie.title,
      year: movie.year,
      tmdb_id: movie.tmdb_id,
      media_type: movie.media_type,
      poster_url: movie.poster_url,
      barcode,
      location: location.trim() || null,
    });
  }

  function addManually(event: FormEvent) {
    event.preventDefault();
    addItem.mutate(
      {
        title: term.trim(),
        year: year ? Number(year) : null,
        barcode,
        location: location.trim() || null,
      },
      {
        onSuccess: () => {
          setTerm("");
          setYear("");
        },
      },
    );
  }

  function lookUpTyped(event: FormEvent) {
    event.preventDefault();
    if (typedBarcode.trim()) lookup.mutate(typedBarcode.trim());
  }

  function handleDetected(code: string) {
    setScanning(false);
    lookup.mutate(code);
  }

  return (
    <>
      <header className="add-dialog-head">
        <h2 id="add-dialog-title">Add a DVD</h2>
        <button type="button" className="text-button" onClick={onClose}>
          Done
        </button>
      </header>

      <section className="barcode" aria-label="Barcode">
        {scanning ? (
          <BarcodeScanner onDetected={handleDetected} onCancel={() => setScanning(false)} />
        ) : (
          <form className="barcode-row" onSubmit={lookUpTyped}>
            <button type="button" className="secondary" onClick={() => setScanning(true)}>
              Scan barcode
            </button>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={typedBarcode}
              onChange={(e) => setTypedBarcode(e.target.value)}
              placeholder="or type the barcode"
              aria-label="Barcode number"
            />
            <button
              type="submit"
              className="secondary"
              disabled={!typedBarcode.trim() || lookup.isPending}
            >
              Look up
            </button>
          </form>
        )}

        <div aria-live="polite">
          {lookup.isPending && <p className="muted">Looking up the barcode…</p>}
          {lookup.isError && <p className="error">{lookup.error.message}</p>}
          {scan && !lookup.isPending && (
            <div className="barcode-status">
              {scan.match ? (
                <>
                  <p>
                    Already on your shelf: <strong>{scan.match.title}</strong>
                    {scan.owned_count > 1 && ` (${scan.owned_count} copies)`}.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => scan.match && addFromSearch(scan.match)}
                    disabled={addItem.isPending}
                  >
                    Add another copy
                  </button>
                </>
              ) : scan.lookup_error ? (
                <p>
                  {scan.lookup_error} Type the title below instead, and barcode {scan.barcode} is
                  saved with it, so next time this disc is recognised straight away.
                </p>
              ) : scan.product_title ? (
                <p>
                  Barcode {scan.barcode} is “{scan.product_title}”. Pick the right title below and
                  the barcode is saved with it.
                </p>
              ) : (
                <p>
                  Barcode {scan.barcode} isn't in the barcode database. Search for the title below
                  and the barcode is saved with it.
                </p>
              )}
              <button type="button" className="text-button" onClick={() => setScan(null)}>
                Forget this barcode
              </button>
            </div>
          )}
        </div>
      </section>

      <form
        className="add-dialog-fields"
        onSubmit={showManual ? addManually : (e: FormEvent) => e.preventDefault()}
      >
        <label>
          Film or TV show
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
          Title search is switched off because the server has no TMDB key. Type the details in
          instead.
        </p>
      )}

      {!showManual && (
        <>
          {search.isFetching && <p className="muted">Searching…</p>}
          {search.isError && !searchUnavailable && (
            <p className="error">Search failed: {search.error.message}. Try again in a moment.</p>
          )}
          {search.data && search.data.length === 0 && (
            <p className="muted">
              No films or TV shows match “{query}”. Check the spelling, or add it by hand.
            </p>
          )}
          {search.data && search.data.length > 0 && (
            <ul className="results">
              {search.data.map((movie) => {
                const added = addedKeys.includes(resultKey(movie));
                const kind = kindLabel(movie.media_type);
                return (
                  <li key={resultKey(movie)}>
                    {movie.poster_url ? (
                      <img src={movie.poster_url} alt="" loading="lazy" />
                    ) : (
                      <span className="results-noposter" />
                    )}
                    <span className="results-title">
                      <strong>{movie.title}</strong>
                      <span className="muted">
                        {movie.year ? `${movie.year} · ${kind}` : kind}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={added ? "text-button" : "secondary"}
                      onClick={() => addFromSearch(movie)}
                      disabled={addItem.isPending}
                      aria-label={`Add ${movie.title} (${kind}${movie.year ? `, ${movie.year}` : ""})`}
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
          {manual ? "Search for the title instead" : "Not listed? Add it by hand"}
        </button>
      )}
    </>
  );
}
