import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, CONDITIONS } from "../api";
import type { DiscFormat, InventoryItem, InventoryItemChanges, InventoryItemDetails } from "../api";
import { TitleBody, TitleHeader } from "./TitleInfo";

// Short names so the Format dropdown doesn't cut off.
const FORMAT_OPTIONS: { value: DiscFormat; label: string }[] = [
  { value: "dvd", label: "DVD" },
  { value: "bluray", label: "Blu-ray" },
  { value: "uhd", label: "4K Ultra HD" },
];
// How long after the last keystroke "Where it is" saves itself.
const LOCATION_SAVE_DELAY_MS = 800;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A bin, for removing a disc from the shelf. */
function BinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  itemId: number | null;
  onClose: () => void;
}

export function TitleDetailsDialog({ itemId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = itemId !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="details-dialog"
      onClose={onClose}
      // A click on the dimmed backdrop lands on the dialog element itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label="Title details"
    >
      {itemId !== null && <DetailsBody key={itemId} itemId={itemId} onClose={onClose} />}
    </dialog>
  );
}

function DetailsBody({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["inventory", "item", itemId],
    queryFn: () => api.getItem(itemId),
  });

  return (
    <div className="details">
      <button type="button" className="close-button" onClick={onClose} aria-label="Close">
        ×
      </button>
      {query.isPending && <p className="muted">Loading…</p>}
      {query.isError && <p className="error">Could not load this title: {query.error.message}</p>}
      {query.data && <DetailsContent data={query.data} onClose={onClose} />}
    </div>
  );
}

/**
 * Your copy, always editable: changing a dropdown saves at once, and "Where it is" saves itself
 * shortly after you stop typing (or when you leave the box). The bin removes the disc.
 * The barcode is kept but not shown: it only matters to the app (scanning, search).
 */
function CopyFields({ item, onRemoved }: { item: InventoryItem; onRemoved: () => void }) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<DiscFormat>(item.format);
  const [location, setLocation] = useState(item.location ?? "");
  const [condition, setCondition] = useState(item.condition ?? "");
  const savedLocation = useRef(item.location ?? "");
  // Keep a condition saved before these choices existed, so it isn't silently dropped.
  const conditions =
    item.condition && !CONDITIONS.includes(item.condition)
      ? [...CONDITIONS, item.condition]
      : CONDITIONS;

  const save = useMutation({
    mutationFn: (changes: InventoryItemChanges) => api.updateItem(item.id, changes),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      onRemoved();
    },
  });

  function saveLocation() {
    const value = location.trim();
    if (value === savedLocation.current) return;
    savedLocation.current = value;
    save.mutate({ location: value || null });
  }

  // Save "Where it is" a moment after typing stops.
  useEffect(() => {
    if (location.trim() === savedLocation.current) return;
    const timer = setTimeout(saveLocation, LOCATION_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps -- saveLocation reads the latest state

  const status = save.isPending
    ? "Saving…"
    : save.isError
      ? null
      : save.isSuccess
        ? "Saved"
        : null;

  return (
    <>
      <div className="copy-fields">
        <label>
          Format
          <select
            value={format}
            onChange={(e) => {
              const next = e.target.value as DiscFormat;
              setFormat(next);
              save.mutate({ format: next });
            }}
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Where it is
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={saveLocation}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveLocation();
              }
            }}
            placeholder="e.g. Shelf A, the attic"
            maxLength={100}
          />
        </label>
        <label>
          Condition
          <select
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value);
              save.mutate({ condition: e.target.value || null });
            }}
          >
            <option value="">Not set</option>
            {conditions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="copy-added">
          <span className="copy-added-label">Added</span>
          <span>{formatDate(item.added_at)}</span>
        </div>
        <div className="copy-bin">
          {/* One click removes the disc and closes the details; no confirm step. */}
          <button
            type="button"
            className="bin-button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label="Remove from shelf"
            title="Remove from shelf"
          >
            <BinIcon />
          </button>
        </div>
      </div>
      <p className="copy-status" aria-live="polite">
        {status && <span className="muted">{status}</span>}
        {save.isError && <span className="error">Could not save: {save.error.message}</span>}
        {remove.isError && <span className="error">Could not remove it: {remove.error.message}</span>}
      </p>
    </>
  );
}

function DetailsContent({ data, onClose }: { data: InventoryItemDetails; onClose: () => void }) {
  const { item, details } = data;

  return (
    <>
      <TitleHeader title={item.movie} details={details} format={item.format} />

      <section className="details-section">
        <h3>Your copy</h3>
        <CopyFields item={item} onRemoved={onClose} />
        {item.notes && <p className="muted">{item.notes}</p>}
      </section>

      {data.details_error && <p className="muted">{data.details_error}</p>}
      {!details && !data.details_error && (
        <p className="muted">
          This title was added by hand, so there is no description or cast for it.
        </p>
      )}

      {details && <TitleBody details={details} />}
    </>
  );
}
