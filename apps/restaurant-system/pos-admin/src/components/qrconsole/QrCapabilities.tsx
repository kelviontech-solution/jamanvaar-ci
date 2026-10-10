import { QrCountedStock } from "./QrCountedStock";
import { QrBranchPreferences } from "./QrBranchPreferences";
import { QrPromotions } from "./QrPromotions";
import { useEffect, useState, useRef } from "react";
import { qrApi } from "../../cloud/cloudClient";
import { QrAdminApi, type QrOrderRow } from "../../cloud/qrAdminClient";
const base = "/api/v1/restaurant/qr/advanced";
const input =
  "mt-1 w-full min-w-0 rounded-xl border border-jaman-border bg-white px-3 py-2.5 text-sm";
const button =
  "rounded-xl bg-jaman-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40";
type Configuration = {
  version: number;
  overrideKeys: string[];
  settings: Record<string, any>;
  capabilities: Array<{ code: string; enabled: boolean; reason: string }>;
  module: { planName: string; limits: Record<string, unknown> };
  usage: { activeCodes: number; activeBranches: number };
  identity: { reason: string };
};
const toggles = [
  ["inventoryEnabled", "QR_INVENTORY_SYNC", "Counted dish stock reservations"],
  ["loyaltyEnabled", "QR_LOYALTY", "Verified customer loyalty"],
  ["groupEnabled", "QR_GROUP_ORDERING", "Shared table sessions"],
  ["multilingualEnabled", "QR_MULTILINGUAL", "Multilingual menu"],
  ["feedbackEnabled", "QR_FEEDBACK", "Private order feedback"],
  ["historyEnabled", "QR_ORDER_HISTORY", "Browser order history"],
  ["notificationsEnabled", "QR_NOTIFICATIONS", "Operational alerts"],
  ["capacityEnabled", "QR_KITCHEN_CAPACITY", "Shared kitchen workload"],
  ["promotionsEnabled", "QR_PROMOTIONS", "Menu recommendations"],
] as const;
const labels: Record<string, string> = {
  QR_GROUP_ORDERING: "Shared ordering",
  QR_SPLIT_PAYMENT: "Split counter collections",
  QR_LOYALTY: "Loyalty",
  QR_MULTI_BRANCH: "Branch administration",
  QR_USAGE_LIMITS: "Advanced quotas",
  QR_ACCESSIBILITY: "Presentation preferences",
  QR_INVENTORY_SYNC: "Inventory controls",
};

export function QrCapabilities({
  showToast,
  section: requestedSection,
  hideNavigation = false,
}: {
  showToast: (message: string) => void;
  section?: string;
  hideNavigation?: boolean;
}) {
  const [data, setData] = useState<Configuration | null>(null),
    [changes, setChanges] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [section, setSection] = useState(requestedSection || "Settings");
  useEffect(() => {
    if (requestedSection) {
      setSection(requestedSection);
      setError("");
    }
  }, [requestedSection]);
  const [preview, setPreview] = useState<{
    items: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
  }>({ items: [], categories: [] });
  const [locale, setLocale] = useState("hi"),
    [entity, setEntity] = useState("items"),
    [itemId, setItemId] = useState(""),
    [name, setName] = useState(""),
    [description, setDescription] = useState("");
  const [feedbackFrom, setFeedbackFrom] = useState(""),
    [feedbackTo, setFeedbackTo] = useState(""),
    [feedbackRating, setFeedbackRating] = useState("");
  const feedbackPath = () =>
    base +
    "/feedback?" +
    new URLSearchParams({
      ...(feedbackFrom ? { from: feedbackFrom } : {}),
      ...(feedbackTo ? { to: feedbackTo } : {}),
      ...(feedbackRating ? { rating: feedbackRating } : {}),
    });
  const [feedback, setFeedback] = useState<any>(null),
    [alerts, setAlerts] = useState<any>(null),
    [orders, setOrders] = useState<QrOrderRow[]>([]),
    [selected, setSelected] = useState(""),
    [ledger, setLedger] = useState<any>(null),
    [amount, setAmount] = useState(""),
    [refundAmount, setRefundAmount] = useState(""),
    [refundReason, setRefundReason] = useState("");
  // Keep a failed request's allocation reference until its outcome is known.
  const allocationAttempt = useRef<{ identity: string; key: string } | null>(
    null,
  );
  const attemptKey = (kind: string, amount: number, reason = "") => {
    const identity = JSON.stringify([selected, kind, amount, reason]);
    if (allocationAttempt.current?.identity !== identity)
      allocationAttempt.current = { identity, key: crypto.randomUUID() };
    return allocationAttempt.current.key;
  };
  const reload = async () => {
    const c = await qrApi<Configuration>(base);
    setData(c);
    setChanges({});
  };
  useEffect(() => {
    const t = { ...data?.settings, ...changes }.translations?.[locale]?.[
      entity
    ]?.[itemId];
    setName(t?.name ?? "");
    setDescription(t?.description ?? "");
  }, [locale, entity, itemId]);
  useEffect(() => {
    let active = true;
    Promise.all([qrApi<Configuration>(base), QrAdminApi.menuPreview()])
      .then(([c, m]) => {
        if (active) {
          setData(c);
          setPreview(m as typeof preview);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const licensed = (code: string) =>
    data?.capabilities.some((c) => c.code === code && c.enabled) ?? false;
  const settings = { ...data?.settings, ...changes };
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (message) showToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!data) return;
    let active = true;
    const fetch = async () => {
      try {
        if (section === "Feedback" && licensed("QR_FEEDBACK")) {
          const r = await qrApi(base + "/feedback");
          if (active) setFeedback(r);
        }
        if (section === "Alerts" && licensed("QR_NOTIFICATIONS")) {
          const r = await qrApi(base + "/notifications");
          if (active) setAlerts(r);
        }
        if (section === "Collections") {
          const r = await QrAdminApi.orders();
          if (active) setOrders(r);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void fetch();
    const t =
      section === "Alerts"
        ? setInterval(() => {
            if (!document.hidden) void fetch();
          }, 10000)
        : undefined;
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [section, data]);
  if (!data)
    return (
      <p role="status" className="p-5">
        {error || "Loading licensed QR capabilities..."}
      </p>
    );
  const entities = entity === "items" ? preview.items : preview.categories;
  const text = settings.translations?.[locale]?.[entity]?.[itemId];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-jaman-border bg-white p-5">
        <h2 className="text-xl font-bold text-jaman-navy">
          Advanced QR capabilities
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {data.module.planName} · {data.usage.activeCodes} active codes ·{" "}
          {data.usage.activeBranches} active branches
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Optional access comes from Super Admin plans and add-ons. Existing
          ordering continues to work independently.
        </p>
        {!hideNavigation && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Settings",
              "Translations",
              "Promotions",
              "Feedback",
              "Alerts",
              "Collections",
              "License",
            ].map((s) => (
              <button
                key={s}
                className={
                  section === s
                    ? button
                    : "rounded-xl border px-4 py-2.5 text-sm"
                }
                onClick={() => {
                  setSection(s);
                  setError("");
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {section === "Settings" && (
        <div className="rounded-2xl border border-jaman-border bg-white p-5">
          <h3 className="font-bold">Features for this branch</h3>
          <p className="mt-1 text-sm text-slate-500">
            Only changed settings become local overrides.{" "}
            {data.overrideKeys.length
              ? `Local overrides: ${data.overrideKeys.join(", ")}`
              : "Settings follow restaurant defaults."}
          </p>
          <div className="my-4 grid gap-3 sm:grid-cols-2">
            {toggles.map(([flag, cap, label]) => (
              <label
                key={flag}
                className="flex items-center justify-between gap-3 rounded-xl border p-4 text-sm"
              >
                <span>
                  <b>{label}</b>
                  <small className="mt-1 block text-slate-500">
                    {licensed(cap)
                      ? "Included in your license"
                      : "Unavailable under current license"}
                  </small>
                </span>
                <input
                  type="checkbox"
                  disabled={!licensed(cap)}
                  checked={!!settings[flag]}
                  onChange={(e) =>
                    setChanges({ ...changes, [flag]: e.target.checked })
                  }
                />
              </label>
            ))}
          </div>
          {licensed("QR_KITCHEN_CAPACITY") && (
            <fieldset className="my-5">
              <legend className="font-bold">Advanced workload estimates</legend>
              <p className="text-sm text-slate-500">
                Counts unfinished dish quantities across POS, Captain, Kiosk and
                QR in this branch. No accepted order is automatically cancelled.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "workloadLimit",
                    "Stop new QR orders at units (0 = unlimited)",
                  ],
                  ["busyAtWorkload", "Busy estimate threshold (0 = off)"],
                  ["busyExtraMinutes", "Extra minutes when busy"],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs">
                    {label}
                    <input
                      type="number"
                      min="0"
                      max={key === "busyExtraMinutes" ? 180 : 10000}
                      value={settings[key]}
                      className={input}
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {licensed("QR_PROMOTIONS") && (
            <label className="block text-sm">
              Recommended menu items (customers choose whether to add)
              <select
                className={input}
                multiple
                size={5}
                value={settings.recommendationIds ?? []}
                onChange={(e) =>
                  setChanges({
                    ...changes,
                    recommendationIds: Array.from(e.target.selectedOptions).map(
                      (o) => o.value,
                    ),
                  })
                }
              >
                {preview.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {licensed("QR_NOTIFICATIONS") && (
            <fieldset className="my-4">
              <legend className="font-bold">Alert types</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {[
                  "NEW_ORDER",
                  "CASH_DUE",
                  "PAYMENT_COLLECTED",
                  "PAYMENT_PENDING",
                  "CANCELLED",
                  "REFUND",
                ].map((type) => (
                  <label key={type} className="text-xs">
                    <input
                      type="checkbox"
                      checked={settings.notificationTypes?.includes(type)}
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          notificationTypes: e.target.checked
                            ? [...settings.notificationTypes, type]
                            : settings.notificationTypes.filter(
                                (t: string) => t !== type,
                              ),
                        })
                      }
                    />{" "}
                    {type.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button
            className={button}
            disabled={busy || !Object.keys(changes).length}
            onClick={() =>
              void run(async () => {
                await qrApi(base, {
                  method: "PUT",
                  body: JSON.stringify({ changes, version: data.version }),
                });
                await reload();
              }, "QR preferences saved")
            }
          >
            Save changes
          </button>
          {licensed("QR_INVENTORY_SYNC") && (
            <QrCountedStock showToast={showToast} />
          )}
          {licensed("QR_MULTI_BRANCH") && (
            <QrBranchPreferences
              changes={changes}
              version={data.version}
              overrideKeys={data.overrideKeys}
              reload={reload}
              showToast={showToast}
            />
          )}
        </div>
      )}
      {section === "Translations" && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Menu translations</h3>
          {!licensed("QR_MULTILINGUAL") ? (
            <p className="mt-3 text-sm">
              Multilingual menu management is not included. Contact your
              platform administrator.
            </p>
          ) : (
            <>
              <div className="my-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Enabled languages (comma separated codes)
                  <input
                    className={input}
                    value={settings.languages?.join(",")}
                    onChange={(e) =>
                      setChanges({
                        ...changes,
                        languages: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Default language
                  <select
                    className={input}
                    value={settings.defaultLanguage}
                    onChange={(e) =>
                      setChanges({
                        ...changes,
                        defaultLanguage: e.target.value,
                      })
                    }
                  >
                    {settings.languages?.map((l: string) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Missing text falls back to the canonical menu. Enter reviewed
                translations; prices and item identities stay the same.
              </p>
              <div className="my-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs">
                  Language
                  <select
                    aria-label="Language"
                    className={input}
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                  >
                    {[
                      ...new Set([
                        "en",
                        "hi",
                        "gu",
                        ...(settings.languages ?? []),
                      ]),
                    ].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Content
                  <select
                    aria-label="Content"
                    className={input}
                    value={entity}
                    onChange={(e) => {
                      setEntity(e.target.value);
                      setItemId("");
                    }}
                  >
                    <option value="items">Dishes</option>
                    <option value="categories">Categories</option>
                  </select>
                </label>
                <label className="text-xs">
                  Menu record
                  <select
                    aria-label="Menu record"
                    className={input}
                    value={itemId}
                    onChange={(e) => {
                      setItemId(e.target.value);
                      const t =
                        settings.translations?.[locale]?.[entity]?.[
                          e.target.value
                        ];
                      setName(t?.name ?? "");
                      setDescription(t?.description ?? "");
                    }}
                  >
                    <option value="">Select...</option>
                    {entities.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-sm">
                Translated name
                <input
                  className={input}
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="mt-3 block text-sm">
                Description
                <textarea
                  className={input}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <p className="my-3 text-xs text-slate-500">
                {text
                  ? "Translation exists. Saving replaces this text."
                  : "Translation missing; the customer sees the original name."}{" "}
                {
                  preview.items.filter(
                    (i) => settings.translations?.[locale]?.items?.[i.id],
                  ).length
                }
                /{preview.items.length} dish names translated in {locale}.
              </p>
              <button
                className={button}
                disabled={busy || !itemId || !name.trim()}
                onClick={() =>
                  void run(async () => {
                    const translations = {
                      [locale]: {
                        [entity]: { [itemId]: { name, description } },
                      },
                    };
                    const next = { ...changes, translations };
                    await qrApi(base, {
                      method: "PUT",
                      body: JSON.stringify({
                        changes: next,
                        version: data.version,
                      }),
                    });
                    await reload();
                  }, "Translation saved")
                }
              >
                Save reviewed translation
              </button>
              <button
                className="ml-3 rounded-xl border px-4 py-2.5 text-sm"
                disabled={busy || !Object.keys(changes).length}
                onClick={() =>
                  void run(async () => {
                    await qrApi(base, {
                      method: "PUT",
                      body: JSON.stringify({ changes, version: data.version }),
                    });
                    await reload();
                  }, "Languages saved")
                }
              >
                Save language settings
              </button>
            </>
          )}
        </div>
      )}
      {section === "Promotions" &&
        (licensed("QR_PROMOTIONS") ? (
          <QrPromotions showToast={showToast} />
        ) : (
          <p className="rounded-2xl border bg-white p-5">
            Promotions are not included in this license.
          </p>
        ))}
      {section === "Feedback" && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Verified private feedback</h3>
          {licensed("QR_FEEDBACK") && (
            <div className="mt-3 flex flex-wrap gap-3 items-end">
              <label className="text-xs">
                From date (UTC)
                <input
                  className={input}
                  type="date"
                  value={feedbackFrom}
                  onChange={(e) => setFeedbackFrom(e.target.value)}
                />
              </label>
              <label className="text-xs">
                To date (UTC)
                <input
                  className={input}
                  type="date"
                  value={feedbackTo}
                  onChange={(e) => setFeedbackTo(e.target.value)}
                />
              </label>
              <label className="text-xs">
                Rating
                <select
                  aria-label="Feedback rating"
                  className={input}
                  value={feedbackRating}
                  onChange={(e) => setFeedbackRating(e.target.value)}
                >
                  <option value="">All ratings</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void run(async () => setFeedback(await qrApi(feedbackPath())))
                }
              >
                Filter feedback
              </button>
              {feedback && (
                <button
                  className={button}
                  onClick={() => {
                    const cell = (v: unknown) => {
                      let text = String(v ?? "");
                      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
                      return '"' + text.replaceAll('"', '""') + '"';
                    };
                    const csv = [
                      ["Order", "Branch", "Rating", "Comment", "Date"],
                      ...feedback.feedback.map((r: any) => [
                        r.orderNumber || r.orderId,
                        r.branchId,
                        r.rating,
                        r.comment,
                        r.createdAt,
                      ]),
                    ]
                      .map((row) => row.map(cell).join(","))
                      .join("\r\n");
                    const url = URL.createObjectURL(
                        new Blob(["\ufeff" + csv], {
                          type: "text/csv;charset=utf-8",
                        }),
                      ),
                      link = document.createElement("a");
                    link.href = url;
                    link.download = "qr-verified-feedback.csv";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Export feedback CSV
                </button>
              )}
            </div>
          )}
          {!licensed("QR_FEEDBACK") ? (
            <p className="mt-3">Feedback is not included in this license.</p>
          ) : feedback ? (
            <>
              <p className="my-3">
                Average {feedback.average?.toFixed(1) ?? "—"} / 5 ·{" "}
                {feedback.total} responses (most recent 500)
              </p>
              {feedback.distribution.map((r: any) => (
                <span key={r.rating} className="mr-4 text-sm">
                  {r.rating} stars: {r.count}
                </span>
              ))}
              {feedback.feedback.map((r: any) => (
                <article key={r.id} className="mt-4 rounded-xl border p-4">
                  <b>{r.rating}/5</b>
                  <p className="my-1 text-sm whitespace-pre-wrap">
                    {r.comment || "No comment"}
                  </p>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </article>
              ))}
            </>
          ) : (
            <p className="mt-3">Loading feedback...</p>
          )}
        </div>
      )}
      {section === "Alerts" && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Recoverable operational alerts</h3>
          <p className="mt-1 text-sm text-slate-500">
            These alerts come from authoritative orders and confirmed
            collections. Closing this screen does not erase them.
          </p>
          {!licensed("QR_NOTIFICATIONS") ? (
            <p className="mt-3">Advanced notifications are not licensed.</p>
          ) : alerts?.enabled ? (
            <>
              {alerts.quiet && <p>Quiet hours are active.</p>}
              {alerts.alerts.map((a: any) => (
                <article
                  key={a.id}
                  className="mt-3 rounded-xl border p-4 text-sm"
                >
                  <b>
                    {a.type.replaceAll("_", " ")} · {a.orderNumber}
                  </b>
                  <p>{new Date(a.at).toLocaleString()}</p>
                </article>
              ))}
              {!alerts.alerts.length && (
                <p className="mt-3">No alerts in the last 24 hours.</p>
              )}
            </>
          ) : (
            <p className="mt-3">Enable operational alerts in Settings.</p>
          )}
        </div>
      )}
      {section === "Collections" && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">
            Payment attempts and confirmed collections
          </h3>
          <label className="mt-3 block text-sm">
            QR order
            <select
              aria-label="QR order"
              className={input}
              value={selected}
              onChange={(e) => {
                const id = e.target.value;
                setSelected(id);
                setLedger(null);
                if (id)
                  void run(async () =>
                    setLedger(
                      await qrApi(
                        base + `/orders/${encodeURIComponent(id)}/ledger`,
                      ),
                    ),
                  );
              }}
            >
              <option value="">Select order...</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber ?? o.id} · {o.paymentStatus}
                </option>
              ))}
            </select>
          </label>
          {ledger && (
            <>
              <div className="my-4 flex flex-wrap gap-5 text-sm">
                <b>Due ₹{(ledger.totalPaise / 100).toFixed(2)}</b>
                <b>Collected ₹{(ledger.collectedPaise / 100).toFixed(2)}</b>
                <b>Remaining ₹{(ledger.outstandingPaise / 100).toFixed(2)}</b>
                <b>Refunded ₹{(ledger.refundedPaise / 100).toFixed(2)}</b>
              </div>
              {ledger.entries.map((entry: any) => (
                <p
                  key={entry.id}
                  className="my-2 rounded-xl border p-3 text-sm"
                >
                  {entry.kind} · {entry.method} · ₹
                  {(entry.amount / 100).toFixed(2)} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              ))}
              {ledger.netCollectedPaise > 0 &&
                orders.find((o) => o.id === selected)?.paymentMethod ===
                  "CASH_AT_COUNTER" && (
                  <fieldset className="my-4 rounded-xl border border-red-100 p-4">
                    <legend className="text-sm font-bold">
                      Record cash returned to the customer
                    </legend>
                    <label className="block text-sm">
                      Amount refunded (?)
                      <input
                        className={input}
                        type="number"
                        min="0.01"
                        max={ledger.netCollectedPaise / 100}
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                      />
                    </label>
                    <label className="mt-2 block text-sm">
                      Reason
                      <input
                        className={input}
                        maxLength={300}
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                      />
                    </label>
                    <p className="my-2 text-xs text-slate-500">
                      Requires current owner or manager sign-in. This records
                      physical cash returned; it does not call an online
                      gateway.
                    </p>
                    <button
                      className={button}
                      disabled={
                        busy ||
                        !(Number(refundAmount) > 0) ||
                        refundReason.trim().length < 3
                      }
                      onClick={() =>
                        void run(async () => {
                          const current = (await QrAdminApi.orders()).find(
                            (o) => o.id === selected,
                          );
                          if (!current) throw Error("Order unavailable");
                          await qrApi(
                            base +
                              `/orders/${encodeURIComponent(selected)}/refund-cash`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                amountPaise: Math.round(
                                  Number(refundAmount) * 100,
                                ),
                                version: current.version,
                                idempotencyKey: attemptKey(
                                  "refund",
                                  Math.round(Number(refundAmount) * 100),
                                  refundReason.trim(),
                                ),
                                reason: refundReason.trim(),
                              }),
                            },
                          );
                          setLedger(
                            await qrApi(
                              base +
                                `/orders/${encodeURIComponent(selected)}/ledger`,
                            ),
                          );
                          setOrders(await QrAdminApi.orders());
                          allocationAttempt.current = null;
                          setRefundAmount("");
                          setRefundReason("");
                        }, "Cash refund recorded")
                      }
                    >
                      Confirm cash has been refunded
                    </button>
                  </fieldset>
                )}
              {ledger.attempts.map((attempt: any) => (
                <p key={attempt.id} className="my-2 text-xs text-slate-500">
                  Gateway attempt: {attempt.status} · ₹
                  {(attempt.amount / 100).toFixed(2)}
                </p>
              ))}
              {licensed("QR_SPLIT_PAYMENT") &&
                ledger.outstandingPaise > 0 &&
                orders.find((o) => o.id === selected)?.paymentMethod ===
                  "CASH_AT_COUNTER" && (
                  <div className="mt-4">
                    <label className="text-sm">
                      Cash physically received (₹)
                      <input
                        className={input}
                        type="number"
                        min="0.01"
                        max={ledger.outstandingPaise / 100}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    <p className="my-2 text-xs text-slate-500">
                      Only confirm money you have received. Partial collection
                      keeps the remaining balance open.
                    </p>
                    <button
                      className={button}
                      disabled={busy || !(Number(amount) > 0)}
                      onClick={() =>
                        void run(async () => {
                          const current = (await QrAdminApi.orders()).find(
                            (o) => o.id === selected,
                          );
                          if (!current)
                            throw Error("Order no longer available");
                          await qrApi(
                            base +
                              `/orders/${encodeURIComponent(selected)}/cash`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                amountPaise: Math.round(Number(amount) * 100),
                                version: current.version,
                                idempotencyKey: attemptKey(
                                  "collect",
                                  Math.round(Number(amount) * 100),
                                ),
                              }),
                            },
                          );
                          setLedger(
                            await qrApi(
                              base +
                                `/orders/${encodeURIComponent(selected)}/ledger`,
                            ),
                          );
                          setOrders(await QrAdminApi.orders());
                          allocationAttempt.current = null;
                          setAmount("");
                        }, "Cash collection recorded")
                      }
                    >
                      Record cash received
                    </button>
                  </div>
                )}
            </>
          )}
        </div>
      )}
      {section === "License" && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Licensed capabilities and limits</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.capabilities.map((c) => (
              <div key={c.code} className="rounded-xl border p-3 text-sm">
                <b>
                  {labels[c.code] ??
                    toggles.find((t) => t[1] === c.code)?.[2] ??
                    c.code}
                </b>
                <p className="mt-1 text-slate-500">
                  {c.enabled ? "Included" : c.reason.replaceAll("_", " ")}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">{data.identity.reason}</p>
          <dl className="mt-3 text-xs">
            {Object.entries(data.module.limits)
              .filter(([k, v]) => k.startsWith("qr") && typeof v === "number")
              .map(([k, v]) => (
                <div key={k} className="flex justify-between border-b py-2">
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
