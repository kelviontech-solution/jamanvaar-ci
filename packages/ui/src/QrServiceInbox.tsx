import { useEffect, useRef, useState } from "react";
export interface QrServiceRequest {
  id: string;
  version: number;
  label: string;
  note: string;
  status: string;
  tableNumber: string;
  branchId?: string;
  branchName?: string;
  assignedDeviceName?: string;
  quietNow?: boolean;
  overdue: boolean;
  createdAt: string;
  assignedDeviceId?: string;
  history?: Array<{ status: string; at: string }>;
}
export function QrServiceInbox({
  api,
}: {
  api: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
}) {
  const [rows, setRows] = useState<QrServiceRequest[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("PENDING"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [hidden, setHidden] = useState(false);
  const [page,setPage]=useState(0);
  const unavailable = useRef(0);
  const seen = useRef<Set<string> | null>(null);
  const mounted = useRef(true);
  const refresh = async () => {
    if (unavailable.current > Date.now()) return;
    try {
      const r = await api<{ requests: QrServiceRequest[]; quietNow?: boolean }>(
        "/requests",
      );
      if (!mounted.current) return;
      const next = new Set(r.requests.map((r) => r.id));
      if (
        seen.current &&
        r.requests.some(
          (r) => !r.quietNow && !seen.current!.has(r.id) && r.status === "OPEN",
        )
      )
        setNotice("New table service request received");
      seen.current = next;
      unavailable.current = 0;
      setHidden(false);
      setRows(r.requests);
      setError("");
    } catch (e) {
      if (
        /optional QR feature is not included|subscription does not enable|not enabled/.test(
          (e as Error).message,
        )
      ) {
        unavailable.current = Date.now() + 60000;
        setHidden(true);
        setError("");
      } else if (mounted.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const wake = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [api]);
  const act = async (r: QrServiceRequest, status: string) => {
    if (busy) return;
    setBusy(r.id);
    try {
      await api(`/requests/${encodeURIComponent(r.id)}/action`, "POST", {
        status,
        version: r.version,
      });
      setNotice("Request " + status.toLowerCase().replaceAll("_", " "));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy("");
    }
  };
  if (hidden) return null;
  const filtered=rows.filter(r=>(filter==='ALL'||(filter==='PENDING'&&!['COMPLETED','CANCELLED','EXPIRED'].includes(r.status))||r.status===filter)&&`${r.tableNumber} ${r.label} ${r.note}`.toLowerCase().includes(search.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/50)),shownPage=Math.min(page,pages-1);
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">
          QR table service requests
        </h2>
        <button
          onClick={() => void refresh()}
          className="rounded-xl border px-4 py-2"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Shared with this branch's QR Admin, POS and Captain. Status is recovered
        from the server every 5 seconds. All current requests and the latest 200 history entries are included.
      </p>
      <p role="status" className="text-sm text-emerald-700">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search service requests"
          placeholder="Table, request or note"
          value={search}
          onChange={(e) => {setSearch(e.target.value);setPage(0);}}
          className="rounded-xl border px-3 py-2"
        />
        <select
          aria-label="Service request status"
          value={filter}
          onChange={(e) => {setFilter(e.target.value);setPage(0);}}
          className="rounded-xl border px-3 py-2"
        >
          {[
            "PENDING",
            "ALL",
            "OPEN",
            "ACKNOWLEDGED",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
            "EXPIRED",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows
          .filter(
            (r) =>
              (filter === "ALL" ||
                (filter === "PENDING" &&
                  !["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.status)) ||
                r.status === filter) &&
              `${r.tableNumber} ${r.label} ${r.note}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .slice(shownPage*50,(shownPage+1)*50)
          .map((r) => (
            <article
              key={r.id}
              className={`rounded-2xl border p-4 ${r.overdue ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
            >
              <h3 className="font-bold">
                Table {r.tableNumber} · {r.label}
              </h3>
              <p className="text-xs text-slate-500">
                {new Date(r.createdAt).toLocaleString()} ·{" "}
                {r.status.replaceAll("_", " ")}
                {r.overdue ? " · OVERDUE" : ""}
              </p>
              {r.note && <p className="my-3 text-sm">{r.note}</p>}
              {r.branchId && (
                <p className="text-xs text-slate-500">
                  {r.branchName || "Assigned branch"}
                </p>
              )}
              {r.assignedDeviceName && (
                <p className="mt-1 text-xs text-slate-500">
                  Assigned to {r.assignedDeviceName}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.status) &&
                  [
                    ["ACKNOWLEDGED", "Acknowledge"],
                    ["IN_PROGRESS", "Start"],
                    ["COMPLETED", "Complete"],
                    ["CANCELLED", "Cancel"],
                  ]
                    .filter(
                      ([s]) =>
                        s !== r.status &&
                        !(r.status === "IN_PROGRESS" && s === "ACKNOWLEDGED"),
                    )
                    .map(([s, l]) => (
                      <button
                        key={s}
                        disabled={!!busy}
                        onClick={() => void act(r, s)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                      >
                        {l}
                      </button>
                    ))}
              </div>
              {r.history?.length ? (
                <details className="mt-3 text-xs">
                  <summary>Activity history</summary>
                  {r.history.map((h, i) => (
                    <p key={i}>
                      {h.status} · {new Date(h.at).toLocaleString()}
                    </p>
                  ))}
                </details>
              ) : null}
            </article>
          ))}
      </div>
      {pages>1&&<div className="flex flex-wrap items-center gap-3 text-sm"><button disabled={shownPage===0} onClick={()=>setPage(shownPage-1)} className="rounded-lg border px-3 py-2">Previous requests</button><span>{filtered.length} requests · Page {shownPage+1} of {pages}</span><button disabled={shownPage===pages-1} onClick={()=>setPage(shownPage+1)} className="rounded-lg border px-3 py-2">Next requests</button></div>}
      {!filtered.length && !error && (
        <p className="text-sm text-slate-500">{filter==='PENDING'?'No pending service requests.':'No matching requests.'}</p>
      )}
    </section>
  );
}
