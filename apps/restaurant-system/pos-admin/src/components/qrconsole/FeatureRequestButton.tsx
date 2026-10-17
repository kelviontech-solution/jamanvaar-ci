import { useState } from "react";
import { QrAdminApi } from "../../cloud/qrAdminClient";

/**
 * A locked feature used to be a dead end ("not included in this license" with no next step).
 * This raises an ordinary FEATURE_REQUEST support ticket -- the same inbox Super Admin already
 * works every other ticket from -- so an owner can ask for it without leaving the page, and
 * platform staff see it without a new admin screen.
 */
export function FeatureRequestButton({
  featureCode,
  featureLabel,
}: {
  featureCode: string;
  featureLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  // Q07: "Request sent" used to be the only trace of this ever happening — no ticket number,
  // nothing to reference if the owner came back later wondering whether it was seen. The backend
  // already returns one (requestFeature raises an ordinary ticket); it just wasn't being shown.
  // Tracked under Help & Support in this console's own nav like any other ticket.
  const [sentTicket, setSentTicket] = useState<number | null>(null);
  const [error, setError] = useState("");
  if (sentTicket !== null) {
    return (
      <p className="mt-2 text-sm font-bold text-emerald-700">
        Request sent as ticket TKT-{String(sentTicket).padStart(6, "0")}. Track it under Help & Support.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        className="rounded-xl border px-4 py-2 text-sm font-bold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { ticketNumber } = await QrAdminApi.requestFeature(featureCode, featureLabel);
            setSentTicket(ticketNumber);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : `Request ${featureLabel}`}
      </button>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
