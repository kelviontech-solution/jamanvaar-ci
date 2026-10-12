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
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  if (sent) {
    return (
      <p className="mt-2 text-sm font-bold text-emerald-700">
        Request sent. Your platform administrator will follow up.
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
            await QrAdminApi.requestFeature(featureCode, featureLabel);
            setSent(true);
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
