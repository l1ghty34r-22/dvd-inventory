import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api, ApiError } from "../api";
import type { BarcodeLookup, MediaType, MovieSearchResult, NewInventoryItem } from "../api";
import { BarcodeScanner } from "./BarcodeScanner";
import { TitleBody, TitleHeader } from "./TitleInfo";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const kindLabel = (mediaType: MediaType) => (mediaType === "tv" ? "TV series" : "Film");
const resultKey = (r: { media_type: string; tmdb_id: number | null }) => `${r.media_type}:${r.tmdb_id}`;

interface Target {
  media_type: MediaType;
  tmdb_id: number;
}

interface Props {
  open: boolean;
  /** Open with the camera already on. */
  startScanning?: boolean;
  onClose: () => void;
}

export function AddDvdDialog({ open, startScanning = false, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="add-dialog" onClose={onClose} aria-labelledby="add-dialog-title">
      {/* Mounted only while open, so it starts fresh and the camera turns off on close. */}
      {open && <AddDvdBody onClose={onClose} startScanning={startScanning} />}
    </dialog>
  );
}

function AddDvdBody({ onClose, startScanning }: { onClose: () => void; startScanning: boolean }) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [location, setLocation] = useState("");
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState("");
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const [scanning, setScanning] = useState(startScanning);
  const [typedBarcode, setTypedBarcode] = useState("");
  // The barcode that will be saved with the next title added.
  const [scan, setScan] = useState<BarcodeLookup | null>(null);
  // When set, the dialog shows that title's page instead of the search.
  const [preview, setPreview] = useState<Target | null>(null);

  const query = useDebounced(term.trim(), 300);
  const search = useQuery({
    queryKey: ["movie-search", query],
    queryFn: () => api.searchMovies(query),
    enabled: query.length >= 2 && !manual && !preview,
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
      // Go straight to the title the barcode most likely is.
      if (info.best_match) setPreview(info.best_match);
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

  function addTitle(movie: Omit<NewInventoryItem, "barcode" | "location">) {
    addItem.mutate({ ...movie, barcode, location: location.trim() || null });
  }

  function addFromSearch(movie: MovieSearchResult) {
    addTitle({
      title: movie.title,
      year: movie.year,
      tmdb_id: movie.tmdb_id,
      media_type: movie.media_type,
      poster_url: movie.poster_url,
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

  function scanAnother() {
    setPreview(null);
    setScan(null);
    setLastAdded(null);
    addItem.reset();
    lookup.reset();
    setScanning(true);
  }

  if (preview) {
    return (
      <>
        <header className="add-dialog-head">
          <button type="button" className="text-button" onClick={() => setPreview(null)}>
            ← Search instead
          </button>
          <button type="button" className="text-button" onClick={onClose}>
            Done
          </button>
        </header>
        <TitlePreviewPanel
          target={preview}
          scan={scan}
          location={location}
          onLocationChange={setLocation}
          onAdd={addTitle}
          adding={addItem.isPending}
          addError={addItem.isError ? addItem.error.message : null}
          added={addedKeys.includes(resultKey(preview))}
          onPick={setPreview}
          onScanAnother={scanAnother}
          onClose={onClose}
        />
      </>
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
              {scan.lookup_error ? (
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
            autoFocus={!startScanning}
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
                    <button
                      type="button"
                      className="results-title"
                      onClick={() => setPreview(movie)}
                      title="See the story and cast"
                    >
                      <strong>{movie.title}</strong>
                      <span className="muted">
                        {movie.year ? `${movie.year} · ${kind}` : kind}
                      </span>
                    </button>
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

interface PreviewProps {
  target: Target;
  scan: BarcodeLookup | null;
  location: string;
  onLocationChange: (value: string) => void;
  onAdd: (movie: Omit<NewInventoryItem, "barcode" | "location">) => void;
  adding: boolean;
  addError: string | null;
  added: boolean;
  onPick: (target: Target) => void;
  onScanAnother: () => void;
  onClose: () => void;
}

/** A title's page, opened from a scan or a search result, with the option to add it. */
function TitlePreviewPanel(props: PreviewProps) {
  const { target, scan, added } = props;
  const [showOthers, setShowOthers] = useState(false);
  const preview = useQuery({
    queryKey: ["inventory", "preview", target.media_type, target.tmdb_id],
    queryFn: () => api.previewTitle(target.media_type, target.tmdb_id),
  });

  const others = (scan?.candidates ?? []).filter(
    (c) => resultKey(c) !== resultKey(target),
  );
  // Include the scanner's first pick when the user has switched away from it.
  if (scan?.best_match && resultKey(scan.best_match) !== resultKey(target)) {
    others.unshift(scan.best_match);
  }

  return (
    <div className="preview">
      {scan && (
        <p className="muted preview-source">
          Scanned barcode {scan.barcode}
          {scan.product_title && <> · “{scan.product_title}”</>}
        </p>
      )}

      {preview.isPending && <p className="muted">Loading…</p>}
      {preview.isError && <p className="error">Could not load this title: {preview.error.message}</p>}

      {preview.data && (
        <>
          <TitleHeader title={preview.data} details={preview.data.details} />

          <div className="preview-add" aria-live="polite">
            {added ? (
              <>
                <p className="confirm">
                  <strong>Added {preview.data.title} to your collection.</strong>
                </p>
                <div className="preview-add-row">
                  <button type="button" className="button primary" onClick={props.onScanAnother}>
                    Scan another
                  </button>
                  <button type="button" className="button secondary" onClick={props.onClose}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                {preview.data.owned_count > 0 && (
                  <p>
                    You already own {preview.data.owned_count === 1 ? "a copy" : `${preview.data.owned_count} copies`} of this.
                  </p>
                )}
                <div className="preview-add-row">
                  <input
                    value={props.location}
                    onChange={(e) => props.onLocationChange(e.target.value)}
                    placeholder="Where you keep it (optional)"
                    aria-label="Where you keep it (optional)"
                  />
                  <button
                    type="button"
                    className="button primary"
                    disabled={props.adding}
                    onClick={() =>
                      props.onAdd({
                        title: preview.data.title,
                        year: preview.data.year,
                        tmdb_id: preview.data.tmdb_id,
                        media_type: preview.data.media_type,
                        poster_url: preview.data.poster_url,
                      })
                    }
                  >
                    {preview.data.owned_count > 0 ? "Add another copy" : "Add to my collection"}
                  </button>
                </div>
                {props.addError && <p className="error">Could not add it: {props.addError}</p>}
              </>
            )}
          </div>

          {others.length > 0 && !added && (
            <div className="preview-others">
              <button
                type="button"
                className="text-button"
                onClick={() => setShowOthers(!showOthers)}
                aria-expanded={showOthers}
              >
                {showOthers ? "Hide other matches" : "Not this one? See other matches"}
              </button>
              {showOthers && (
                <ul className="results">
                  {others.map((movie) => (
                    <li key={resultKey(movie)}>
                      {movie.poster_url ? (
                        <img src={movie.poster_url} alt="" loading="lazy" />
                      ) : (
                        <span className="results-noposter" />
                      )}
                      <span className="results-title static">
                        <strong>{movie.title}</strong>
                        <span className="muted">
                          {[movie.year, kindLabel(movie.media_type)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setShowOthers(false);
                          props.onPick(movie);
                        }}
                      >
                        This one
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <TitleBody details={preview.data.details} />
        </>
      )}
    </div>
  );
}
