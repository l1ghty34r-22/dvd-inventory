import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { api, ApiError, FORMAT_LABELS } from "../api";
import type {
  BarcodeLookup,
  DiscFormat,
  InventoryItem,
  MediaType,
  MovieSearchResult,
  NewInventoryItem,
  TitlePreview,
} from "../api";
import { BarcodeScanner } from "./BarcodeScanner";
import { CaseCover } from "./DvdCase";
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
const MANUAL_FORM = "add-by-hand";
// 8, 12 or 13 digits (spaces and dashes allowed): what a DVD barcode looks like when typed.
const looksLikeBarcode = (text: string) => /^\d{8,14}$/.test(text.replace(/[\s-]/g, ""));

/** A small barcode drawn with bars, for the scan button. */
function BarcodeIcon() {
  const bars = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2];
  let x = 1;
  return (
    <svg width="26" height="20" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      {bars.map((width, i) => {
        const rect = i % 2 === 0 ? <rect key={i} x={x} y="1" width={width} height="18" rx="0.4" /> : null;
        x += width + (i % 2 === 0 ? 0 : 0.6);
        return rect;
      })}
    </svg>
  );
}

/** The "+" on each search result. */
function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

type TitleFields = Omit<NewInventoryItem, "barcode" | "location" | "format">;

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
  const [format, setFormat] = useState<DiscFormat>("dvd");
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState("");
  // Everything added while this popup is open, newest first, so you can see (and undo) it.
  const [added, setAdded] = useState<InventoryItem[]>([]);
  const addedKeys = added.map((item) => resultKey(item.movie));

  const [scanning, setScanning] = useState(startScanning);
  // The barcode that will be saved with the next title added.
  const [scan, setScan] = useState<BarcodeLookup | null>(null);
  // When set, the left side shows that title's page instead of the search.
  const [target, setTarget] = useState<Target | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const query = useDebounced(term.trim(), 300);
  const search = useQuery({
    queryKey: ["movie-search", query],
    queryFn: () => api.searchMovies(query),
    enabled: query.length >= 2 && !manual && !target && !looksLikeBarcode(query),
    retry: false,
  });
  // 503 means the server has no TMDB key, so only typing the details in will work.
  const searchUnavailable = search.error instanceof ApiError && search.error.status === 503;
  const showManual = manual || searchUnavailable;

  const preview = useQuery({
    queryKey: ["inventory", "preview", target?.media_type, target?.tmdb_id],
    queryFn: () => api.previewTitle(target!.media_type, target!.tmdb_id),
    enabled: target !== null,
  });

  const lookup = useMutation({
    mutationFn: api.lookupBarcode,
    onSuccess: (info) => {
      setScan(info);
      if (info.format_guess) setFormat(info.format_guess);
      if (info.title_guess) setTerm(info.title_guess);
      // Go straight to the title the barcode most likely is.
      if (info.best_match) openTitle(info.best_match);
    },
  });

  const addItem = useMutation({
    mutationFn: api.addItem,
    onSuccess: (item) => {
      setAdded((list) => [item, ...list]);
      // A barcode belongs to one disc, so do not carry it over to the next title.
      setScan(null);
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const undo = useMutation({
    mutationFn: (id: number) => api.deleteItem(id),
    onSuccess: (_, id) => {
      setAdded((list) => list.filter((item) => item.id !== id));
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const barcode = scan?.barcode ?? null;
  const targetAdded = target !== null && addedKeys.includes(resultKey(target));

  function openTitle(next: Target) {
    setTarget(next);
    setShowOthers(false);
    addItem.reset();
  }

  function addTitle(movie: TitleFields) {
    addItem.mutate({ ...movie, barcode, format, location: location.trim() || null });
  }

  function addFromResult(movie: MovieSearchResult | TitlePreview) {
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
    if (looksLikeBarcode(term)) {
      lookup.mutate(term.trim());
      return;
    }
    // Enter in the title box only adds in hand-entry mode; while searching it does nothing.
    if (!showManual || !term.trim()) return;
    addItem.mutate(
      {
        title: term.trim(),
        year: year ? Number(year) : null,
        barcode,
        format,
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

  function handleDetected(code: string) {
    setScanning(false);
    lookup.mutate(code);
  }

  function scanAnother() {
    setTarget(null);
    setScan(null);
    addItem.reset();
    lookup.reset();
    setScanning(true);
  }

  // Other titles the scan could be, for "Not this one?".
  const others: MovieSearchResult[] = [];
  if (scan?.best_match) others.push(scan.best_match);
  others.push(...(scan?.candidates ?? []));
  const otherMatches = target ? others.filter((o) => resultKey(o) !== resultKey(target)) : [];

  return (
    <div className="add-layout">
      <header className="add-head">
        <h2 id="add-dialog-title">Every Disc Deserves a Shelf</h2>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {/* Left: find the title */}
      <div className="add-main">
        {target ? (
          <>
            {scan && (
              <p className="muted preview-source">
                Scanned barcode {scan.barcode}
                {scan.product_title && <> · “{scan.product_title}”</>}
              </p>
            )}
            {preview.isPending && <p className="muted">Loading…</p>}
            {preview.isError && (
              <p className="error">Could not load this title: {preview.error.message}</p>
            )}
            {preview.data && <TitleHeader title={preview.data} details={preview.data.details} />}

            {showOthers && otherMatches.length > 0 && (
              <section className="details-section">
                <h3>Other matches</h3>
                <ul className="results">
                  {otherMatches.map((movie) => (
                    <ResultRow key={resultKey(movie)} movie={movie}>
                      <button type="button" className="secondary" onClick={() => openTitle(movie)}>
                        This one
                      </button>
                    </ResultRow>
                  ))}
                </ul>
              </section>
            )}

            {preview.data && <TitleBody details={preview.data.details} />}
          </>
        ) : (
          <>
            <form id={MANUAL_FORM} className="add-dialog-fields" onSubmit={addManually}>
              <div>
                <label htmlFor="title-search">Film or TV show</label>
                <div className="search-row">
                  <input
                    id="title-search"
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder={showManual ? "Title" : "Search a title, or type a barcode"}
                    autoFocus={!startScanning}
                    autoComplete="off"
                    required
                  />
                  <button
                    type="button"
                    className={scanning ? "icon-button active" : "icon-button"}
                    onClick={() => setScanning(!scanning)}
                    aria-label={scanning ? "Stop scanning" : "Scan a barcode with the camera"}
                    aria-pressed={scanning}
                    title="Scan a barcode"
                  >
                    <BarcodeIcon />
                  </button>
                </div>
                {!searchUnavailable && (
                  <button
                    type="button"
                    className="text-button small-link"
                    onClick={() => setManual(!manual)}
                  >
                    {manual ? "Search instead" : "Not listed? Add it by hand"}
                  </button>
                )}
              </div>
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
            </form>

            {scanning && (
              <div className="scanner-slot">
                <BarcodeScanner onDetected={handleDetected} onCancel={() => setScanning(false)} />
              </div>
            )}

            <div className="barcode-messages" aria-live="polite">
              {looksLikeBarcode(term) && !lookup.isPending && !scan && (
                <p className="muted">Press Enter to look up barcode {term.trim()}.</p>
              )}
              {lookup.isPending && <p className="muted">Looking up the barcode…</p>}
              {lookup.isError && <p className="error">{lookup.error.message}</p>}
              {scan && !lookup.isPending && (
                <p className="muted">
                  {scan.lookup_error
                    ? `${scan.lookup_error} Type the title instead.`
                    : scan.product_title
                      ? `Barcode ${scan.barcode} is “${scan.product_title}”. Pick the right title.`
                      : `Barcode ${scan.barcode} isn't in the barcode database. Search for the title.`}
                </p>
              )}
            </div>

            {searchUnavailable && (
              <p className="muted">
                Title search is switched off because the server has no TMDB key. Type the details
                in, then use “Add to shelf” on the right.
              </p>
            )}

            {!showManual && (
              <div className="add-results">
                {search.isFetching && <p className="muted">Searching…</p>}
                {search.isError && !searchUnavailable && (
                  <p className="error">
                    Search failed: {search.error.message}. Try again in a moment.
                  </p>
                )}
                {search.data && search.data.length === 0 && (
                  <p className="muted">
                    No films or TV shows match “{query}”. Check the spelling, or add it by hand.
                  </p>
                )}
                {search.data && search.data.length > 0 && (
                  <ul className="results">
                    {search.data.map((movie) => {
                      const isAdded = addedKeys.includes(resultKey(movie));
                      const name = `${movie.title} (${kindLabel(movie.media_type)}${movie.year ? `, ${movie.year}` : ""})`;
                      return (
                        <ResultRow
                          key={resultKey(movie)}
                          movie={movie}
                          added={isAdded}
                          onOpen={() => openTitle(movie)}
                        >
                          <button
                            type="button"
                            className="add-icon-button"
                            onClick={() => addFromResult(movie)}
                            disabled={addItem.isPending}
                            aria-label={isAdded ? `Add another copy of ${name}` : `Add ${name}`}
                            title={isAdded ? "Add another copy" : "Add to my collection"}
                          >
                            <PlusIcon />
                          </button>
                        </ResultRow>
                      );
                    })}
                  </ul>
                )}
                {!search.data && !search.isFetching && !looksLikeBarcode(term) && !scanning && (
                  <p className="muted">
                    Type at least two letters, or tap the barcode button to scan the back of the case.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: the copy you own, and what to do next */}
      <aside className="add-side" aria-label="Your copy">
        <h3>Your copy</h3>
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as DiscFormat)}>
            {(Object.keys(FORMAT_LABELS) as DiscFormat[]).map((key) => (
              <option key={key} value={key}>
                {FORMAT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Where you keep it
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
          />
        </label>

        {barcode && (
          <p className="side-note">
            Barcode <strong>{barcode}</strong> will be saved with it.{" "}
            <button type="button" className="text-button" onClick={() => setScan(null)}>
              Forget
            </button>
          </p>
        )}

        <div className="side-status" aria-live="polite">
          {addItem.isError && <p className="error">Could not add it: {addItem.error.message}</p>}
          {undo.isError && <p className="error">Could not undo it: {undo.error.message}</p>}
          {target && preview.data && preview.data.owned_count > 0 && !targetAdded && (
            <p>
              You already own{" "}
              {preview.data.owned_count === 1 ? "a copy" : `${preview.data.owned_count} copies`}.
            </p>
          )}
        </div>

        <div className="side-actions">
          {target ? (
            <>
              {targetAdded ? (
                <button type="button" className="button primary" onClick={scanAnother}>
                  Scan another
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary"
                  disabled={!preview.data || addItem.isPending}
                  onClick={() => preview.data && addFromResult(preview.data)}
                >
                  {preview.data && preview.data.owned_count > 0
                    ? "Add another copy"
                    : "Add to my collection"}
                </button>
              )}
              {otherMatches.length > 0 && !targetAdded && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowOthers(!showOthers)}
                  aria-expanded={showOthers}
                >
                  {showOthers ? "Hide other matches" : "Not this one?"}
                </button>
              )}
              <button type="button" className="button secondary" onClick={() => setTarget(null)}>
                Back to search
              </button>
            </>
          ) : showManual ? (
            <>
              {/* Distinct keys: the button that switches modes must not be reused as the submit
                  button, or the same click would also submit the form. */}
              <button
                key="add-manual"
                type="submit"
                form={MANUAL_FORM}
                className="button primary"
                disabled={addItem.isPending}
              >
                Add to shelf
              </button>
            </>
          ) : null}
        </div>

        {added.length > 0 && (
          <section className="added-list" aria-label="Added this time" aria-live="polite">
            <h3>
              Added this time <span className="added-count">{added.length}</span>
            </h3>
            <ul>
              {added.map((item) => (
                <li key={item.id}>
                  <span className="case mini-case">
                    <CaseCover title={item.movie.title} posterUrl={item.movie.poster_url} />
                  </span>
                  <span className="added-text">
                    <strong>{item.movie.title}</strong>
                    <span className="muted">
                      {[item.movie.year, FORMAT_LABELS[item.format]].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => undo.mutate(item.id)}
                    disabled={undo.isPending}
                    aria-label={`Undo adding ${item.movie.title}`}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button type="button" className="button secondary side-done" onClick={onClose}>
          Done
        </button>
      </aside>
    </div>
  );
}

function ResultRow({
  movie,
  added = false,
  onOpen,
  children,
}: {
  movie: MovieSearchResult;
  /** Already added while this popup is open. */
  added?: boolean;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const kind = kindLabel(movie.media_type);
  const text = (
    <>
      <strong>{movie.title}</strong>
      <span className="muted">
        {movie.year ? `${movie.year} · ${kind}` : kind}
        {added && <span className="added-tag">Added</span>}
      </span>
    </>
  );
  return (
    <li>
      {movie.poster_url ? (
        <img src={movie.poster_url} alt="" loading="lazy" />
      ) : (
        <span className="results-noposter" />
      )}
      {onOpen ? (
        <button
          type="button"
          className="results-title"
          onClick={onOpen}
          title="See the story and cast"
        >
          {text}
        </button>
      ) : (
        <span className="results-title">{text}</span>
      )}
      {children}
    </li>
  );
}
