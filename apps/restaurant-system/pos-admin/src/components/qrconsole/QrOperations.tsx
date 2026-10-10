import { useEffect, useState } from "react";
import { QrServiceInbox } from "@jamanvaar/ui";
import { qrApi } from "../../cloud/cloudClient";
import { QrAdminApi } from "../../cloud/qrAdminClient";
const base = "/api/v1/restaurant/qr/operations";
export const qrRequestsApi = async <T,>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> =>
  qrApi<T>(base + path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const box = "rounded-2xl border border-jaman-border bg-white p-5 space-y-4";
const field =
  "block w-full rounded-xl border border-jaman-border px-3 py-2.5 mt-1 text-sm";
const button =
  "rounded-xl bg-jaman-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40";
export function QrSetupHealth({
  navigate,
}: {
  navigate: (tab: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    qrRequestsApi<any>("/health")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className={box}>
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-bold">Before your first guest</h2>
        <button className={button} onClick={() => void load()}>
          Check setup again
        </button>
      </div>
      <p className="text-sm text-slate-500">
        A setup check verifies configuration. Place a small test order and
        confirm staff receive it before opening service.
      </p>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {data && (
        <>
          <p
            role="status"
            className={data.ready ? "text-emerald-700" : "text-amber-800"}
          >
            {data.scope} · {data.completed}/{data.total} checks passed ·{" "}
            {data.ready ? "Required setup is ready" : "Finish the checks below"}
          </p>
          <ul className="divide-y">
            {data.checks.map((c: any) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={c.id}
              >
                <span>
                  {c.ready ? "✓" : "○"} {c.label}{" "}
                  {!c.required && <small>(optional)</small>}
                  {!c.ready && (
                    <p className="text-sm text-slate-600">{c.action}</p>
                  )}
                </span>
                {!c.ready && (
                  <button
                    className="text-sm font-bold text-orange-700"
                    onClick={() => navigate(c.tab)}
                  >
                    Open settings →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function QrServiceOperations() {
  return (
    <div className="space-y-5">
      <QrServiceInbox api={qrRequestsApi} />
      <OperationsSettings mode="service" />
    </div>
  );
}
export function QrPickupOperations() {
  return <OperationsSettings mode="pickup" />;
}
function OperationsSettings({ mode }: { mode: "service" | "pickup" }) {
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<any>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = async () => {
    try {
      const r = await qrRequestsApi<any>("");
      setData(r);
      setDraft(r.settings);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [mode]);
  const licensed = data?.capabilities.capabilities.some(
    (c: any) =>
      c.code ===
        (mode === "service" ? "QR_SERVICE_REQUESTS" : "QR_SCHEDULED_PICKUP") &&
      c.enabled,
  );
  const set = (k: string, v: unknown) =>
    setDraft((s: any) => ({ ...s, [k]: v }));
  const keys =
    mode === "service"
      ? [
          "serviceEnabled",
          "requestTypes",
          "serviceCooldownSeconds",
          "overdueMinutes",
          "requestExpiryMinutes",
          "quietHours",
        ]
      : [
          "pickupEnabled",
          "asapEnabled",
          "leadMinutes",
          "cutoffMinutes",
          "slotMinutes",
          "slotCapacity",
          "pickupDays",
          "pickupHours",
          "closedDates",
          "pickupInstructions",
        ];
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const changes = Object.fromEntries(
        keys
          .filter(
            (k) =>
              JSON.stringify(draft[k]) !== JSON.stringify(data.settings[k]),
          )
          .map((k) => [k, draft[k]]),
      );
      if (!Object.keys(changes).length) {
        setNotice("No changes to save.");
        return;
      }
      await qrRequestsApi("", "PUT", { changes, version: data.version });
      setNotice(
        "Settings saved. Customer pages use these settings on their next refresh.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <p>{error || "Loading operational settings…"}</p>;
  const number = (key: string, label: string, min: number, max: number) => (
    <label className="text-sm">
      {label}
      <input
        className={field}
        type="number"
        min={min}
        max={max}
        value={draft[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  );
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">
        {mode === "service" ? "Service request settings" : "Pickup scheduling"}
      </h2>
      {!licensed && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          This optional feature is not licensed. Ask your platform administrator
          to enable it.
        </p>
      )}
      <fieldset
        disabled={!licensed || busy}
        className="space-y-4 disabled:opacity-60"
      >
        {mode === "service" ? (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.serviceEnabled}
                onChange={(e) => set("serviceEnabled", e.target.checked)}
              />
              Enable customer table requests
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {number(
                "serviceCooldownSeconds",
                "Table cooldown (seconds)",
                15,
                600,
              )}
              {number("overdueMinutes", "Overdue after (minutes)", 1, 120)}
              {number(
                "requestExpiryMinutes",
                "Expire after (minutes)",
                10,
                240,
              )}
            </div>
            <h3 className="font-bold">Request buttons</h3>
            {draft.requestTypes.map((t: any, i: number) => (
              <div className="flex items-center gap-2" key={t.id}>
                <input
                  aria-label={`Enable ${t.label}`}
                  type="checkbox"
                  checked={t.enabled}
                  onChange={(e) =>
                    set(
                      "requestTypes",
                      draft.requestTypes.map((r: any, n: number) =>
                        n === i ? { ...r, enabled: e.target.checked } : r,
                      ),
                    )
                  }
                />
                <input
                  className={field}
                  aria-label={`Label for ${t.id}`}
                  maxLength={60}
                  value={t.label}
                  onChange={(e) =>
                    set(
                      "requestTypes",
                      draft.requestTypes.map((r: any, n: number) =>
                        n === i ? { ...r, label: e.target.value } : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "requestTypes",
                      draft.requestTypes.filter((_: any, n: number) => n !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className={button}
              onClick={() =>
                set("requestTypes", [
                  ...draft.requestTypes,
                  {
                    id:
                      "CUSTOM_" + crypto.randomUUID().slice(0, 8).toUpperCase(),
                    label: "New request",
                    enabled: true,
                  },
                ])
              }
            >
              Add request type
            </button>
            <p className="text-sm text-slate-600">
              Requests remain in the inbox through quiet hours; staff can
              recover them after reconnecting. Alerts here are visual, with no
              external messages or alarm sounds.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!draft.quietHours}
                onChange={(e) =>
                  set(
                    "quietHours",
                    e.target.checked ? { start: "22:00", end: "08:00" } : null,
                  )
                }
              />
              Quiet hours
            </label>
            {draft.quietHours && (
              <div className="flex gap-3">
                <label>
                  From
                  <input
                    type="time"
                    className={field}
                    value={draft.quietHours.start}
                    onChange={(e) =>
                      set("quietHours", {
                        ...draft.quietHours,
                        start: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="time"
                    className={field}
                    value={draft.quietHours.end}
                    onChange={(e) =>
                      set("quietHours", {
                        ...draft.quietHours,
                        end: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.pickupEnabled}
                onChange={(e) => set("pickupEnabled", e.target.checked)}
              />
              Enable scheduled takeaway pickup
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.asapEnabled}
                onChange={(e) => set("asapEnabled", e.target.checked)}
              />
              Allow ASAP takeaway
            </label>
            <p className="text-sm text-slate-600">
              Available on menu-only QR codes for takeaway. Table QR orders stay
              dine-in. Times use the restaurant timezone and also respect
              ordering hours. Pending online orders reserve capacity until
              safely cancelled; payment failures never free a slot while a
              payment could still succeed.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {number(
                "leadMinutes",
                "Minimum preparation lead (minutes)",
                5,
                240,
              )}
              {number("cutoffMinutes", "Booking cutoff (minutes)", 0, 240)}
              {number("slotMinutes", "Slot interval (minutes)", 10, 120)}
              {number("slotCapacity", "Orders per slot", 1, 500)}
              {number("pickupDays", "Booking horizon (days)", 1, 7)}
            </div>
            <h3 className="font-bold">Pickup hours</h3>
            {draft.pickupHours.map((h: any, i: number) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  aria-label="Pickup day"
                  className={field + " !w-auto"}
                  value={h.day}
                  onChange={(e) =>
                    set(
                      "pickupHours",
                      draft.pickupHours.map((r: any, n: number) =>
                        n === i ? { ...r, day: Number(e.target.value) } : r,
                      ),
                    )
                  }
                >
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d, n) => (
                      <option value={n} key={d}>
                        {d}
                      </option>
                    ),
                  )}
                </select>
                {(["open", "close"] as const).map((k) => (
                  <input
                    aria-label={`Pickup ${k} ${i}`}
                    key={k}
                    type="time"
                    className={field + " !w-auto"}
                    value={h[k]}
                    onChange={(e) =>
                      set(
                        "pickupHours",
                        draft.pickupHours.map((r: any, n: number) =>
                          n === i ? { ...r, [k]: e.target.value } : r,
                        ),
                      )
                    }
                  />
                ))}
                <button
                  onClick={() =>
                    set(
                      "pickupHours",
                      draft.pickupHours.filter((_: any, n: number) => i !== n),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className={button}
              onClick={() =>
                set("pickupHours", [
                  ...draft.pickupHours,
                  { day: 1, open: "10:00", close: "22:00" },
                ])
              }
            >
              Add hours
            </button>
            <label className="block text-sm">
              Closed dates (one YYYY-MM-DD per line)
              <textarea
                className={field}
                value={draft.closedDates.join("\n")}
                onChange={(e) =>
                  set("closedDates", e.target.value.split("\n").filter(Boolean))
                }
              />
            </label>
            <label className="block text-sm">
              Pickup instructions
              <textarea
                className={field}
                maxLength={300}
                value={draft.pickupInstructions}
                onChange={(e) => set("pickupInstructions", e.target.value)}
              />
            </label>
          </>
        )}
        <button className={button} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      <p role="status" className="text-emerald-700">
        {notice}
      </p>
    </section>
  );
}
export function QrMenuPerformance() {
  const today = new Date().toISOString().slice(0, 10),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    qrRequestsApi<any>(`/analytics?from=${from}&to=${to}`)
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const csv = () => {
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\t\r-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "Dish",
        "Category",
        "Detail opens / quick-add views",
        "Add sessions",
        "Ordered quantity",
        "Ordered value (paise)",
        "Discount (paise)",
        "Orders containing dish",
        "Collected (paise)",
        "Refunded (paise)",
        "Net collected (paise)",
        "Cost",
        "Profit",
      ],
      ...data.items.map((i: any) => [
        i.name,
        i.category,
        i.views,
        i.adds,
        i.orderedQuantity,
        i.orderedValuePaise,
        i.discountPaise,
        i.orderCount,
        i.collectedPaise,
        i.refundedPaise,
        i.netCollectedPaise,
        "Unavailable",
        "Unavailable",
      ]),
    ];
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(
          ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
          { type: "text/csv;charset=utf-8" },
        ),
      );
    a.href = url;
    a.download = `qr-menu-performance-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">Menu performance</h2>
      <div className="flex flex-wrap gap-3">
        <label>
          From
          <input
            className={field}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            className={field}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className={button} onClick={() => void load()}>
          Apply dates
        </button>
        {data && (
          <button className={button} onClick={csv}>
            Export CSV
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="text-sm text-slate-600">
            {data.dateBasis}. Uses the currently selected admin branch.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(data.funnel).map(([k, v]) => (
              <div className="rounded-xl bg-slate-50 p-3" key={k}>
                <b className="text-xl">{String(v)}</b>
                <p className="text-xs">{k.replace(/([A-Z])/g, " $1")}</p>
              </div>
            ))}
          </div>
          <p className="text-sm">
            Menu-view to accepted-order conversion:{" "}
            {data.conversion.percent.toFixed(1)}%. Denominator:{" "}
            {data.conversion.denominator}. Repeated orders can exceed 100%.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Dish",
                    "Views",
                    "Adds",
                    "Quantity",
                    "Orders / discount",
                    "Net collections",
                    "Cost / profit",
                  ].map((t) => (
                    <th className="p-3" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((i: any) => (
                  <tr className="border-t" key={i.id}>
                    <td className="p-3">
                      {i.name}
                      <small className="block text-slate-500">
                        {i.category}
                      </small>
                    </td>
                    <td>{i.views}</td>
                    <td>{i.adds}</td>
                    <td>{i.orderedQuantity}</td>
                    <td>
                      {i.orderCount} / ₹
                      {(i.discountPaise / 100).toLocaleString("en-IN")}
                    </td>
                    <td>
                      ₹{(i.netCollectedPaise / 100).toLocaleString("en-IN")}
                    </td>
                    <td>Unavailable</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [
                "Sales by category",
                data.byCategory.map((r: any) => ({
                  label: r.category,
                  detail: `${r.quantity} units · ₹${(r.netCollectedPaise / 100).toLocaleString("en-IN")} net collected`,
                })),
              ],
              [
                "Ordering modes",
                data.byMode.map((r: any) => ({
                  label: r.label,
                  detail: `${r.orders} orders · ₹${(r.valuePaise / 100).toLocaleString("en-IN")} order value`,
                })),
              ],
              [
                "Daily order trend (UTC)",
                data.trend.map((r: any) => ({
                  label: r.label,
                  detail: `${r.orders} orders · ₹${(r.valuePaise / 100).toLocaleString("en-IN")} order value`,
                })),
              ],
              [
                "Orders by hour (UTC)",
                data.byHour.map((r: any) => ({
                  label: r.label,
                  detail: `${r.orders} orders`,
                })),
              ],
            ].map(([title, rows]: any) => (
              <div key={title} className="rounded-xl border p-4">
                <h3 className="font-bold">{title}</h3>
                {rows.length ? (
                  rows.map((r: any) => (
                    <p
                      key={r.label}
                      className="my-2 flex flex-wrap justify-between gap-2 text-sm"
                    >
                      <span>{r.label}</span>
                      <span>{r.detail}</span>
                    </p>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No activity yet.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-amber-900">{data.costCoverage.message}</p>
          <p className="text-xs text-slate-500">{data.definitions}</p>
          <h3 className="font-bold">Service request activity</h3>
          <p className="text-sm">
            {Object.entries(data.requestCounts)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
          {!data.items.length && <p>No item activity in this date range.</p>}
        </>
      )}
    </section>
  );
}
export function QrBrandStudio() {
  const [draft, setDraft] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [images, setImages] = useState<any>({}),
    [previewStage, setPreviewStage] = useState("MENU"),
    [previewSize, setPreviewSize] = useState("MOBILE"),
    [busy, setBusy] = useState(false),
    [licensed, setLicensed] = useState(false);
  useEffect(() => {
    QrAdminApi.branding()
      .then(setDraft)
      .catch((e) => setError(e.message));
    qrRequestsApi<any>("")
      .then((r) =>
        setLicensed(
          r.capabilities.capabilities.some(
            (c: any) => c.code === "QR_BRANDING" && c.enabled,
          ),
        ),
      )
      .catch(() => {});
  }, []);
  const set = (k: string, v: unknown) =>
    setDraft((d: any) => ({ ...d, [k]: v }));
  const upload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    key: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1400000
    ) {
      setError("Choose PNG, JPEG or WebP under 1.4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setImages((p: any) => ({ ...p, [key]: reader.result }));
    reader.readAsDataURL(file);
  };
  const save = async (reset = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = reset
        ? { reset: true }
        : {
            ...Object.fromEntries(
              [
                "welcomeTitle",
                "welcomeMessage",
                "footerMessage",
                "orderButtonLabel",
                "accentColor",
                ...(licensed
                  ? ["backgroundColor", "layout", "contactMessage"]
                  : []),
              ].map((k) => [
                k,
                draft[k] ??
                  (k === "backgroundColor"
                    ? "#FAF8F3"
                    : k === "layout"
                      ? "CARDS"
                      : ""),
              ]),
            ),
            ...images,
          };
      const r = await qrApi<any>("/api/v1/restaurant/qr/branding", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setDraft(r);
      setImages({});
      setNotice(
        reset
          ? "Branding reset."
          : "Branding saved. Refresh a customer page to see the change.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!draft) return <p>{error || "Loading branding…"}</p>;
  const accent = draft.accentColor || "#c2570c";
  const channels = accent
    .slice(1)
    .match(/.{2}/g)
    ?.map((v: string) => parseInt(v, 16)) || [194, 87, 12];
  const brightAccent =
    channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 > 160;
  return (
    <section className={box}>
      <h2 className="text-xl font-bold">Customer page branding</h2>
      <p className="text-sm text-slate-600">
        Preview your words, images and palette before saving. Your live guest
        page keeps the restaurant and table identity supplied by the QR code.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {[
            ["welcomeTitle", "Welcome heading", 80],
            ["welcomeMessage", "Welcome message", 300],
            ["footerMessage", "Footer message", 300],
            ["orderButtonLabel", "Order button label", 30],
          ].map(([k, l, max]) => (
            <label key={k} className="block text-sm">
              {l}
              <input
                className={field}
                maxLength={Number(max)}
                value={draft[k] ?? ""}
                onChange={(e) => set(String(k), e.target.value)}
              />
            </label>
          ))}
          <label className="block text-sm">
            Accent colour
            <input
              className={field}
              type="color"
              value={accent}
              onChange={(e) => set("accentColor", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Restaurant logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={field}
              onChange={(e) => void upload(e, "logo")}
            />
          </label>
          <button
            className="text-sm"
            onClick={() => setImages((p: any) => ({ ...p, logo: null }))}
          >
            Use default logo
          </button>
          <fieldset disabled={!licensed} className="space-y-3">
            <legend className="font-bold">Optional advanced branding</legend>
            {!licensed && (
              <p className="text-sm text-amber-800">
                QR Branding is not included in this license.
              </p>
            )}
            <label className="block text-sm">
              Cover image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className={field}
                onChange={(e) => void upload(e, "cover")}
              />
            </label>
            <button
              className="text-sm"
              onClick={() => setImages((p: any) => ({ ...p, cover: null }))}
            >
              Use menu cover
            </button>
            <label className="block text-sm">
              Light background
              <input
                type="color"
                className={field}
                value={draft.backgroundColor || "#FAF8F3"}
                onChange={(e) => set("backgroundColor", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Menu presentation
              <select
                aria-label="Menu presentation"
                className={field}
                value={draft.layout || "CARDS"}
                onChange={(e) => set("layout", e.target.value)}
              >
                <option value="CARDS">Image cards</option>
                <option value="COMPACT">Compact list</option>
              </select>
            </label>
            <label className="block text-sm">
              Contact / assistance message
              <input
                className={field}
                maxLength={160}
                value={draft.contactMessage || ""}
                onChange={(e) => set("contactMessage", e.target.value)}
              />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className={button}
              onClick={() => void save()}
            >
              Save branding
            </button>
            <button
              className="rounded-xl border px-4 py-2 text-sm"
              disabled={busy}
              onClick={() =>
                void QrAdminApi.branding()
                  .then((r) => {
                    setDraft(r);
                    setImages({});
                    setNotice("Unsaved changes discarded.");
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Discard changes
            </button>
            {licensed && (
              <button
                disabled={busy}
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => void save(true)}
              >
                Reset defaults
              </button>
            )}
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold text-slate-500">
            STYLE PREVIEW · SAMPLE DATA · NO LIVE ORDER
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              aria-label="Preview screen"
              className={field}
              value={previewStage}
              onChange={(e) => setPreviewStage(e.target.value)}
            >
              <option value="MENU">Menu</option>
              <option value="CART">Cart</option>
              <option value="CHECKOUT">Checkout</option>
            </select>
            <select
              aria-label="Preview device"
              className={field}
              value={previewSize}
              onChange={(e) => setPreviewSize(e.target.value)}
            >
              <option value="MOBILE">Mobile</option>
              <option value="DESKTOP">Desktop</option>
            </select>
          </div>
          <div
            className={`mx-auto ${previewSize === "MOBILE" ? "max-w-sm" : "w-full"} overflow-hidden rounded-[28px] border-4 border-slate-800 shadow-lg`}
            style={{
              background: draft.backgroundColor || "#FAF8F3",
              color: "#0b253a",
            }}
          >
            <header className="flex items-center gap-3 bg-white p-4">
              <img
                className="h-12 w-20 object-contain"
                src={
                  images.logo === null
                    ? `${location.pathname.startsWith("/qr/") ? "/qr/" : "/restaurant-admin/"}assets/branding/jamanvaar-logo.png`
                    : images.logo ||
                      draft.logoUrl ||
                      `${location.pathname.startsWith("/qr/") ? "/qr/" : "/restaurant-admin/"}assets/branding/jamanvaar-logo.png`
                }
                alt="Preview logo"
              />
              <div>
                <b>{draft.welcomeTitle || "Your restaurant"}</b>
                <small className="block">Main branch · Table 1</small>
              </div>
            </header>
            {images.cover !== null && (images.cover || draft.coverUrl) && (
              <img
                className="h-32 w-full object-cover"
                src={
                  images.cover === null ? "" : images.cover || draft.coverUrl
                }
                alt="Preview cover"
              />
            )}
            <div className="p-5">
              <span
                className="text-xs font-bold"
                style={{ color: brightAccent ? "#0b253a" : accent }}
              >
                FRESH FROM OUR KITCHEN
              </span>
              <h3 className="my-3 text-2xl font-bold">
                Good food.
                <br />
                Great company.
              </h3>
              <p className="text-sm">
                {draft.welcomeMessage ||
                  "Pick your favourites, make them yours, and let us take care of the rest."}
              </p>
              <div className="mt-4 rounded-2xl bg-white p-4">
                <h4 className="mb-2 font-bold">
                  {previewStage === "MENU"
                    ? "Our menu"
                    : previewStage === "CART"
                      ? "Your cart"
                      : "Checkout"}
                </h4>
                <b>Sample Gujarati Thali</b>
                <p className="text-sm">Shaak, dal, rice and rotli</p>
                <p className="mt-3 font-bold">₹299</p>
                {previewStage !== "MENU" && (
                  <p className="mt-3 text-sm">
                    1 meal · Subtotal ₹299 · Total ₹299
                  </p>
                )}
                {previewStage === "CHECKOUT" && (
                  <p className="mt-3 text-sm">
                    Pay at counter · Sample preview
                  </p>
                )}
              </div>
              <button
                disabled
                className="mt-5 w-full rounded-xl p-3 font-bold"
                style={{
                  background: accent,
                  color: brightAccent ? "#0b253a" : "#fff",
                }}
              >
                {draft.orderButtonLabel || "Place order"} · ₹299
              </button>
              <p className="mt-4 text-sm">{draft.contactMessage}</p>
              <p className="mt-4 text-center text-xs">{draft.footerMessage}</p>
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      <p role="status" className="text-emerald-700">
        {notice}
      </p>
      <p className="text-xs text-slate-500">
        Custom domains require verified DNS ownership, TLS and routing setup by
        the platform administrator. Customer links currently use the configured
        platform domain.
      </p>
    </section>
  );
}
