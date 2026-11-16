import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import type { InventoryItemDetails } from "../api";
import { TitleBody, TitleHeader } from "./TitleInfo";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

function DetailsContent({ data, onClose }: { data: InventoryItemDetails; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { item, details } = data;
  const { movie } = item;

  const remove = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
  });

  const copy: [string, string][] = [
    ["Where it is", item.location ?? "Not set"],
    ["Condition", item.condition ?? "Not set"],
    ["Barcode", item.barcode ?? "None saved"],
    ["Added", formatDate(item.added_at)],
  ];

  return (
    <>
      <TitleHeader title={movie} details={details} />

      {data.details_error && <p className="muted">{data.details_error}</p>}
      {!details && !data.details_error && (
        <p className="muted">
          This title was added by hand, so there is no description or cast for it.
        </p>
      )}

      {details && <TitleBody details={details} />}

      <section className="details-section">
        <h3>Your copy</h3>
        <dl className="copy-facts">
          {copy.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {item.notes && <p className="muted">{item.notes}</p>}
      </section>

      <div className="details-actions">
        {remove.isError && <p className="error">Could not remove it: {remove.error.message}</p>}
        {confirming ? (
          <>
            <span>Remove this copy from your shelf?</span>
            <button
              type="button"
              className="button danger"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              Yes, remove it
            </button>
            <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="button secondary" onClick={() => setConfirming(true)}>
            Remove from shelf
          </button>
        )}
      </div>
    </>
  );
}
