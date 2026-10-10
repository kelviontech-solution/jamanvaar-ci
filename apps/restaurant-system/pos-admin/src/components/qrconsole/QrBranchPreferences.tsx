import { useEffect, useState } from "react";
import { QrAdminApi, type QrBranch } from "../../cloud/qrAdminClient";
import { qrApi } from "../../cloud/cloudClient";
const base = "/api/v1/restaurant/qr/advanced",
  button =
    "rounded-xl bg-jaman-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40";
type Preview = {
  branches: Array<{
    branchId: string;
    name: string;
    version: number;
    preservedKeys: string[];
    appliedKeys: string[];
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
};
export function QrBranchPreferences({
  changes,
  version,
  overrideKeys,
  reload,
  showToast,
}: {
  changes: Record<string, unknown>;
  version: number;
  overrideKeys: string[];
  reload: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [branches, setBranches] = useState<QrBranch[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    QrAdminApi.branches()
      .then(setBranches)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setPreview(null);
    setConfirm(false);
  }, [JSON.stringify(changes), selected.join(",")]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-5 rounded-xl border bg-[#fbf8f4] p-4">
      <h4 className="font-bold">Branch preferences and inheritance</h4>
      <p className="mt-1 text-xs text-slate-500">
        Use the branch selector in the app header. All-branch propagation
        requires the owner account. Existing local overrides are always
        preserved.
      </p>
      {overrideKeys.length > 0 && (
        <>
          <p className="mt-2 text-xs">
            Restoring defaults removes these local preferences:{" "}
            {overrideKeys.join(", ")}.
          </p>
          <label className="my-3 block text-sm">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            I want this branch to follow restaurant defaults
          </label>
          <button
            className={button}
            disabled={!confirm || busy}
            onClick={() =>
              void run(async () => {
                await qrApi(base + "/inherit", {
                  method: "POST",
                  body: JSON.stringify({ version }),
                });
                await reload();
                setConfirm(false);
                showToast("Branch now follows restaurant defaults");
              })
            }
          >
            Restore inherited preferences
          </button>
        </>
      )}
      {branches.length > 1 && (
        <>
          <label className="mt-4 block text-sm">
            Branches for the currently edited preferences
            <select
              multiple
              size={Math.min(6, branches.length)}
              className="mt-1 w-full rounded-xl border bg-white p-3"
              value={selected}
              onChange={(e) =>
                setSelected(
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className={button + " mt-3"}
            disabled={busy || !selected.length || !Object.keys(changes).length}
            onClick={() =>
              void run(async () =>
                setPreview(
                  await qrApi<Preview>(base + "/propagation", {
                    method: "POST",
                    body: JSON.stringify({ branchIds: selected, changes }),
                  }),
                ),
              )
            }
          >
            Preview selected branch changes
          </button>
          {preview && (
            <div className="mt-4 space-y-3">
              {preview.branches.map((b) => (
                <article
                  key={b.branchId}
                  className="rounded-xl border bg-white p-3 text-xs"
                >
                  <b>{b.name}</b>
                  <p className="mt-1">
                    Preserved local preferences:{" "}
                    {b.preservedKeys.join(", ") || "None"}
                  </p>
                  {Object.entries(b.changes).map(([field, value]) => (
                    <p key={field} className="mt-1 break-words">
                      {field}: {JSON.stringify(value.before)} →{" "}
                      {JSON.stringify(value.after)}
                    </p>
                  ))}
                </article>
              ))}
              <label className="block text-sm">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />{" "}
                Apply this preview to selected branches
              </label>
              <button
                className={button}
                disabled={!confirm || busy}
                onClick={() =>
                  void run(async () => {
                    await qrApi(base + "/propagation", {
                      method: "POST",
                      body: JSON.stringify({
                        branchIds: selected,
                        changes,
                        versions: Object.fromEntries(
                          preview.branches.map((b) => [b.branchId, b.version]),
                        ),
                      }),
                    });
                    setPreview(null);
                    setConfirm(false);
                    await reload();
                    showToast(
                      "Branch preferences applied; local overrides preserved",
                    );
                  })
                }
              >
                Apply reviewed changes
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
