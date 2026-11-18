import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { api, ApiError, CONDITIONS, FORMAT_LABELS } from "../api";
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

const FORMATS: { value: DiscFormat; label: string }[] = [
  { value: "dvd", label: "DVD" },
  { value: "bluray", label: "Blu-ray" },
  { value: "uhd", label: "4K Ultra HD" },
];

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
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Three buttons, one per disc format. Picking one adds the title in that format. */
function FormatPicker({
  label,
  suggested,
  disabled,
  onPick,
  onCancel,
}: {
  label: string;
  /** Read from a scanned barcode's product name; marked so it is the obvious choice. */
  suggested: DiscFormat | null;
  disabled: boolean;
  onPick: (format: DiscFormat) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="format-picker" role="group" aria-label={label}>
      <span className="format-picker-label">{label}</span>
      <div className="format-picker-buttons">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={f.value === suggested ? "format-choice suggested" : "format-choice"}
            onClick={() => onPick(f.value)}
            disabled={disabled}
            title={f.value === suggested ? "Suggested from the barcode" : undefined}
          >
            {f.label}
          </button>
        ))}
        {onCancel && (
          <button type="button" className="text-button format-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
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
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState("");
  // Set in the "Add to my collection" box on the right; kept between adds so a run of discs
  // for the same shelf only needs it typed once.
  const [condition, setCondition] = useState("");
  const [location, setLocation] = useState("");
  // Everything added while this popup is open, newest first, so you can see (and undo) it.
  const [added, setAdded] = useState<InventoryItem[]>([]);
  const addedKeys = added.map((item) => resultKey(item.movie));
  // The search result whose "+" was pressed: it shows the format buttons.
  const [pickingKey, setPickingKey] = useState<string | null>(null);

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
      if (info.title_guess) setTerm(info.title_guess);
      // Go straight to the title the barcode most likely is.
      if (info.best_match) openTitle(info.best_match);
    },
  });

  const addItem = useMutation({
    mutationFn: api.addItem,
    onSuccess: (item) => {
      setAdded((list) => [item, ...list]);
      setPickingKey(null);
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
  const suggested = scan?.format_guess ?? null;
  const targetAdded = target !== null && addedKeys.includes(resultKey(target));

  function openTitle(next: Target) {
    setTarget(next);
    setShowOthers(false);
    setPickingKey(null);
    addItem.reset();
  }

  // Condition and shelf from the box on the right (title pages and hand entry).
  const copyDetails = {
    condition: condition || null,
    location: location.trim() || null,
  };

  function addTitle(
    movie: MovieSearchResult | TitlePreview,
    format: DiscFormat,
    extra: { condition?: string | null; location?: string | null } = {},
  ) {
    const fields: TitleFields = {
      title: movie.title,
      year: movie.year,
      tmdb_id: movie.tmdb_id,
      media_type: movie.media_type,
      poster_url: movie.poster_url,
    };
    addItem.mutate({ ...fields, ...extra, barcode, format });
  }

  function addManually(format: DiscFormat) {
    if (!term.trim()) return;
    addItem.mutate(
      { title: term.trim(), year: year ? Number(year) : null, barcode, format, ...copyDetails },
      {
        onSuccess: () => {
          setTerm("");
          setYear("");
        },
      },
    );
  }

  function handleSubmit(event: FormEvent) {
    // Enter in the search box: look up a typed barcode. Adding is done with the format buttons.
    event.preventDefault();
    if (looksLikeBarcode(term)) lookup.mutate(term.trim());
  }

  function handleDetected(code: string) {
    setScanning(false);
    lookup.mutate(code);
  }

  function backToSearch() {
    setTarget(null);
    addItem.reset();
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

  // The right-hand column only appears once it has something to show.
  const showSide = target !== null || showManual || added.length > 0;

  const addError = addItem.isError && (
    <p className="error">Could not add it: {addItem.error.message}</p>
  );

  return (
    <div className="add-layout">
      <header className="add-head">
        <h2 id="add-dialog-title">Every Disc Deserves a Shelf</h2>
        {/* On a title's page, the ways out of it live here, up top. */}
        <div className="add-head-actions">
          {target && (
            <>
              <button type="button" className="button secondary head-button" onClick={backToSearch}>
                ← Back to search
              </button>
              {otherMatches.length > 0 && !targetAdded && (
                <button
                  type="button"
                  className="button secondary head-button"
                  onClick={() => setShowOthers(!showOthers)}
                  aria-expanded={showOthers}
                >
                  {showOthers ? "Hide other matches" : "Not this one?"}
                </button>
              )}
              {targetAdded && (
                <button type="button" className="button primary head-button" onClick={scanAnother}>
                  Scan another
                </button>
              )}
            </>
          )}
        </div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {/* Between the fixed header and footer: this part scrolls. Until there is a title to add
          or something added, it is just the search (no right-hand column). */}
      <div className={showSide ? "add-body" : "add-body search-only"}>
        {/* Left: find the title and add it */}
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
              <form id={MANUAL_FORM} className="add-dialog-fields" onSubmit={handleSubmit}>
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
                  <>
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
                    <p className="muted small-note">
                      Pick the condition, shelf and format on the right to add it.
                    </p>
                  </>
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
                      ? `${scan.lookup_error} Type the title instead; the barcode is saved with it.`
                      : scan.product_title
                        ? `Barcode ${scan.barcode} is “${scan.product_title}”. Pick the right title; the barcode is saved with it.`
                        : `Barcode ${scan.barcode} isn't in the barcode database. Search for the title; the barcode is saved with it.`}{" "}
                    <button type="button" className="text-button" onClick={() => setScan(null)}>
                      Forget barcode
                    </button>
                  </p>
                )}
              </div>

              {searchUnavailable && (
                <p className="muted">
                  Title search is switched off because the server has no TMDB key. Type the details
                  in, then pick the format to add it.
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
                  {addError}
                  {search.data && search.data.length === 0 && (
                    <p className="muted">
                      No films or TV shows match “{query}”. Check the spelling, or add it by hand.
                    </p>
                  )}
                  {search.data && search.data.length > 0 && (
                    <ul className="results">
                      {search.data.map((movie) => {
                        const key = resultKey(movie);
                        const isAdded = addedKeys.includes(key);
                        const picking = pickingKey === key;
                        const name = `${movie.title} (${kindLabel(movie.media_type)}${movie.year ? `, ${movie.year}` : ""})`;
                        return (
                          <ResultRow
                            key={key}
                            movie={movie}
                            added={isAdded}
                            onOpen={() => openTitle(movie)}
                            below={
                              picking && (
                                <FormatPicker
                                  label="Add as:"
                                  suggested={suggested}
                                  disabled={addItem.isPending}
                                  onPick={(format) => addTitle(movie, format)}
                                  onCancel={() => setPickingKey(null)}
                                />
                              )
                            }
                          >
                            <button
                              type="button"
                              className={picking ? "add-icon-button open" : "add-icon-button"}
                              onClick={() => setPickingKey(picking ? null : key)}
                              aria-expanded={picking}
                              aria-label={
                                isAdded ? `Add another copy of ${name}` : `Add ${name}`
                              }
                              title={isAdded ? "Add another copy" : "Add to my collection"}
                            >
                              <PlusIcon />
                            </button>
                          </ResultRow>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: only what you have added while this popup is open */}
        {showSide && (
        <aside className="add-side" aria-label="Your copy and what you added to your shelf">
          {/* On a title's page or in hand entry: how to add it, with condition and shelf. */}
          {(preview.data || (showManual && !target)) && (
            <section className="side-add" aria-live="polite">
              <h3>{target ? "Add to my collection" : "Add it by hand"}</h3>
              {target && preview.data && (
                targetAdded ? (
                  <p className="confirm side-msg">
                    <strong>Added {preview.data.title}.</strong>
                  </p>
                ) : (
                  preview.data.owned_count > 0 && (
                    <p className="muted side-msg">
                      You already own{" "}
                      {preview.data.owned_count === 1
                        ? "a copy"
                        : `${preview.data.owned_count} copies`}
                      .
                    </p>
                  )
                )
              )}
              <label>
                Condition
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="">Not set</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Where it is
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Shelf A"
                  maxLength={100}
                />
              </label>
              <FormatPicker
                label={
                  target && preview.data && (targetAdded || preview.data.owned_count > 0)
                    ? "Add another copy as:"
                    : "Add as:"
                }
                suggested={suggested}
                disabled={addItem.isPending || (!target && !term.trim())}
                onPick={(format) =>
                  target && preview.data
                    ? addTitle(preview.data, format, copyDetails)
                    : addManually(format)
                }
              />
              {barcode && <p className="muted small-note">Barcode {barcode} is saved with it.</p>}
              {addError}
            </section>
          )}

          <h3>
            Added to shelf
            {added.length > 0 && <span className="added-count">{added.length}</span>}
          </h3>
          {undo.isError && <p className="error">Could not undo it: {undo.error.message}</p>}
          {added.length === 0 ? (
            <p className="muted side-empty">
              Nothing added yet. Titles you add show up here, so you can keep track.
            </p>
          ) : (
            <ul className="added-list" aria-live="polite">
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
          )}
        </aside>
        )}
      </div>

      {/* Always visible at the bottom of the popup, however far you scroll. */}
      <footer className="add-foot">
        <button type="button" className="button primary add-done" onClick={onClose}>
          Done
        </button>
      </footer>
    </div>
  );
}

function ResultRow({
  movie,
  added = false,
  onOpen,
  below,
  children,
}: {
  movie: MovieSearchResult;
  /** Already added while this popup is open. */
  added?: boolean;
  onOpen?: () => void;
  /** Shown under the row, across its full width (the format buttons). */
  below?: ReactNode;
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
      {below && <div className="result-below">{below}</div>}
    </li>
  );
}
