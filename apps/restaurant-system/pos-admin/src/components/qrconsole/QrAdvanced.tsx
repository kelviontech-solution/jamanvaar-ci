import { QrOrderTimeline } from './QrWorkflows';
import { Modal } from '@jamanvaar/ui';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import { activeAdminBranch } from "../../adminBranchScope";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Printer, Save, RefreshCw, Palette, Clock, CreditCard } from "lucide-react";
import {
  QrAdminApi,
  type QrBranch,
  type QrPrintData,
  type QrPrintDesign,
  type QrRules,
  type QrOrderRow,
} from "../../cloud/qrAdminClient";
import {
  DEFAULT_DESIGN,
  QR_DESIGNS,
  designSvg,
  downloadCardPng,
  downloadDesignSvg,
  downloadDesignSet,
  printCards,
  withLogo,
} from "./qrPrint";
import { formatRestaurantDate } from '@jamanvaar/utils';
import { useConfirm } from '@jamanvaar/ui';

const scopedBranch = () =>
  new URLSearchParams(location.search).has('setupBranch')
    ? (new URLSearchParams(location.search).get('setupBranch') === 'restaurant' ? '' : new URLSearchParams(location.search).get('setupBranch') || '')
    :
  /^\/qr\//.test(location.pathname) &&
  activeAdminBranch &&
  activeAdminBranch !== "all"
    ? activeAdminBranch
    : "";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
const input =
  "mt-1 w-full max-w-full min-w-0 rounded-xl border border-jaman-border px-3 py-2.5 text-sm bg-white";
const button =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-jaman-navy text-white disabled:opacity-40";
const box = "rounded-2xl border border-jaman-border bg-white p-5";
type Props = { showToast: (message: string) => void };
function useData<T>(key: string, fn: () => Promise<T>, interval?: number) {
  const loader = useRef(fn);
  loader.current = fn;
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    let active = true,
      running = false;
    setData(null);
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const value = await loader.current();
        if (active) {
          setData(value);
          setError(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = interval
      ? setInterval(() => {
          if (!document.hidden) void load();
        }, interval)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, version, interval]);
  return { data, error, reload, setData };
}
function BranchSelect({
  value,
  onChange,
  branches,
  label = "Branch",
}: {
  value: string;
  onChange: (v: string) => void;
  branches: QrBranch[] | null;
  label?: string;
}) {
  return (
    <label className="text-xs font-bold text-slate-600 max-w-full min-w-0">
      {label}
      <select
        aria-label={label}
        className={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Current admin scope</option>
        {branches
          ?.filter((b) => b.status === "ACTIVE")
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
      </select>
    </label>
  );
}
function Failure({ error }: { error: string | null }) {
  return error ? (
    <p className="text-sm text-rose-700" role="alert">
      {error}
    </p>
  ) : null;
}

export function QrDesignStudio({ showToast }: Props) {
  const tables = useData("tables", QrAdminApi.tables),
    branches = useData("branches", QrAdminApi.branches),
    current = useData("design", QrAdminApi.printDesign),
    branding = useData("branding", QrAdminApi.branding);
  const [design, setDesign] = useState<QrPrintDesign>(DEFAULT_DESIGN),
    [branch, setBranch] = useState(scopedBranch),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<QrPrintData | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (current.data) setDesign(current.data);
  }, [current.data]);
  useQrUnsavedChanges(!!current.data&&JSON.stringify(design)!==JSON.stringify(current.data));
  const active = (tables.data ?? []).filter(
    (t) => t.qr?.status === "ACTIVE" && (!branch || t.branchId === branch),
  );
  const row = active.find((t) => t.tableId === selected[0]) ?? active[0];
  useEffect(() => {
    let live = true;
    setPreview(null);
    if (row?.qr)
      void QrAdminApi.printData(row.qr.id)
        .then(withLogo)
        .then((p) => {
          if (live) setPreview(p);
        })
        .catch((e) => {
          if (live) showToast(e.message);
        });
    return () => {
      live = false;
    };
  }, [row?.qr?.id]);
  // A design tool that can only show you what your choice looks like after you've already gone to
  // a different page and generated a real table QR is backwards -- a new restaurant with zero
  // tables yet (the exact state this was reported broken in) saw a permanently empty preview panel
  // no matter what they picked. This renders something illustrative immediately, from the
  // restaurant's real logo where one's already set, clearly labelled as a sample so it's never
  // mistaken for (or downloaded as) a real, scannable code.
  const [samplePreview, setSamplePreview] = useState<QrPrintData | null>(null);
  useEffect(() => {
    let live = true;
    void withLogo({
      logoUrl: branding.data?.logoUrl ?? null,
      restaurantName: "Your Restaurant Name",
      branchName: null,
      tableLabel: "12",
      url: "https://menu.example/sample-preview",
      tagline: "",
    }).then((p) => { if (live) setSamplePreview(p); });
    return () => { live = false; };
  }, [branding.data?.logoUrl]);
  const isSample = !preview;
  const previewData = preview ?? samplePreview;
  const patch = (change: Partial<QrPrintDesign>) =>
    setDesign((d) => ({ ...d, ...change }));
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const bulk = async () => {
    const chosen = active.filter(
      (t) => !selected.length || selected.includes(t.tableId),
    );
    if (!chosen.length) throw Error("Generate an active table QR first.");
    return Promise.all(
      chosen.map((t) => QrAdminApi.printData(t.qr!.id).then(withLogo)),
    );
  };
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-5">
        <div className={box}>
          <h2 className="font-bold text-lg text-jaman-navy flex gap-2 items-center">
            <Palette size={20} /> QR Design Studio
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Choose a design once; each card keeps its own table's active QR
            destination.
          </p>
          <Failure error={tables.error || current.error} />
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            {QR_DESIGNS.map((t) => {
              const isSelected = design.template === t.id;
              return (
                <button
                  key={t.id}
                  aria-pressed={isSelected}
                  onClick={() => patch({ template: t.id, accent: t.color })}
                  className={`relative overflow-hidden rounded-xl border p-3 text-left text-sm transition-all ${isSelected ? "ring-2 ring-brand border-brand shadow-sm" : "border-jaman-border hover:border-slate-300"}`}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-10"
                    style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)` }}
                  />
                  <div className="relative mt-5 flex items-center justify-between">
                    <span className="font-bold text-jaman-navy">{t.name}</span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/10 rounded-full px-2 py-0.5">
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <label className="text-xs font-bold">
              Instruction
              <input
                aria-label="QR instruction"
                className={input}
                maxLength={70}
                value={design.instruction}
                onChange={(e) => patch({ instruction: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold">
              Footer
              <input
                className={input}
                maxLength={100}
                value={design.footer}
                onChange={(e) => patch({ footer: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold">
              Accent
              <input
                type="color"
                aria-label="QR accent"
                className="block mt-2 h-10 w-20"
                value={design.accent}
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold">
              Print layout
              <select
                className={input}
                value={design.layout}
                onChange={(e) =>
                  patch({ layout: e.target.value as QrPrintDesign["layout"] })
                }
              >
                <option value="CARD">Table card</option>
                <option value="TENT">Folded table tent</option>
                <option value="LABEL">Small label</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={design.showLogo}
                onChange={(e) => patch({ showLogo: e.target.checked })}
              />{" "}
              Restaurant logo
            </label>
          </div>
          <button
            className={button + " mt-4"}
            disabled={busy || !design.instruction.trim()}
            onClick={() =>
              void run(async () => {
                await QrAdminApi.savePrintDesign(design);current.reload();
                showToast("QR design saved for future printing.");
              })
            }
          >
            <Save size={16} />
            Save design
          </button>
        </div>
        <div className={box}>
          <BranchSelect
            value={branch}
            onChange={(v) => {
              setBranch(v);
              setSelected([]);
            }}
            branches={branches.data}
          />
          <p className="text-xs text-slate-500 mt-3">
            Select individual tables, or leave all unchecked to export this
            branch.
          </p>
          <div className="flex flex-wrap gap-3 my-4">
            {active.map((t) => (
              <label
                key={t.tableId}
                className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.tableId)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, t.tableId]
                        : s.filter((id) => id !== t.tableId),
                    )
                  }
                />
                Table {t.displayNumber}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={busy || !active.length}
              className={button}
              onClick={() =>
                void run(async () => printCards(await bulk(), design))
              }
            >
              <Printer size={16} />
              Print / PDF selected
            </button>
            <button
              disabled={busy || !active.length}
              className={button}
              onClick={() =>
                void run(async () => downloadDesignSet(await bulk(), design))
              }
            >
              <Download size={16} />
              Download design set
            </button>
            {!active.length && (
              <span className="text-xs text-slate-500">
                No active table QR codes yet — generate one in Tables & QR first.
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={box + " h-fit"}>
        <h3 className="font-bold mb-3">Print preview</h3>
        {previewData ? (
          <>
            {isSample && (
              <p className="text-xs font-bold text-brand bg-brand/[0.08] border border-brand/30 rounded-lg px-3 py-2 mb-3">
                Sample preview — illustrates your design choices, not a real scannable code.
                Generate a table in Tables & QR for the real one.
              </p>
            )}
            <div
              data-testid="qr-design-preview"
              className="max-w-xs mx-auto min-w-0 [&>svg]:w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: designSvg(previewData, design) }}
            />
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                className={button}
                disabled={busy || isSample}
                title={isSample ? "Generate a real table QR first — a sample can't be downloaded as a working code." : undefined}
                onClick={() =>
                  void run(() => downloadCardPng(preview!, "table-qr", design))
                }
              >
                PNG
              </button>
              <button
                className={button}
                disabled={isSample}
                title={isSample ? "Generate a real table QR first — a sample can't be downloaded as a working code." : undefined}
                onClick={() => downloadDesignSvg(preview!, "table-qr", design)}
              >
                SVG
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              1920 × 2580 PNG. Black modules, white quiet zone. Tent printing
              repeats this card across the fold.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Loading preview…</p>
        )}
      </div>
    </div>
  );
}

export function QrOrderingRules({
  showToast,
  payments = false,
}: Props & { payments?: boolean }) {
  const { confirm, prompt, confirmDialog } = useConfirm();
  const branches = useData("branches", QrAdminApi.branches);
  const [branch, setBranch] = useState(scopedBranch);
  const settings = useData(branch, () => QrAdminApi.settings(branch)),
    ready = useData(branch, () => QrAdminApi.paymentReadiness(branch));
  const [rules, setRules] = useState<QrRules | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),[saveError,setSaveError]=useState('');
  useEffect(() => {
    if (settings.data?.rules) {
      setRules(settings.data.rules);
      setDirty(false);
    }
  }, [settings.data]);
  useQrUnsavedChanges(dirty);
  const save = async (body: Parameters<typeof QrAdminApi.saveSettings>[0]) => {
    setBusy(true);
    setSaveError('');showToast('Saving settings…');
    try {
      await QrAdminApi.saveSettings(body, branch);
      setDirty(false);
      settings.reload();
      ready.reload();
      showToast("Settings saved.");
    } catch (e) {
      setSaveError((e as Error).message);
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const patch = (change: Partial<QrRules>) => {
    setRules((r) => (r ? { ...r, ...change } : r));
    setDirty(true);
  };
  const switches: Array<
    [
      (
        | "allowOnlinePayment"
        | "allowCash"
        | "orderingEnabled"
        | "autoAccept"
        | "menuOnlyEnabled"
      ),
      string,
    ]
  > = payments
    ? [
        ["allowOnlinePayment", "Online payment"],
        ["allowCash", "Cash at Counter"],
      ]
    : [
        ["orderingEnabled", "Accept QR orders"],
        ["autoAccept", "Send accepted orders straight to the kitchen"],
        ["menuOnlyEnabled", "Allow menu / counter codes"],
      ];
  return (
    <>
    <div className="max-w-3xl space-y-5">
      <div className={box}>
        <BranchSelect
          value={branch}
          onChange={async (v) => {
            if (
              !dirty ||
              (await confirm({
                title: "Discard unsaved ordering rules?",
                message: "Switching branch will lose the changes you have not saved.",
                confirmLabel: "Discard changes",
                cancelLabel: "Keep editing",
                tone: "danger",
              }))
            )
              setBranch(v);
          }}
          branches={branches.data}
        />
        <p className="text-xs text-slate-500 mt-2">
          Restaurant defaults apply until a branch overrides a setting. Other
          branches keep their own configuration.
        </p>
        <Failure error={saveError || settings.error || ready.error} />
        {branch && (
          <button
            disabled={busy}
            className="text-sm text-brand font-bold mt-3"
            onClick={async () => {
              if (
                await confirm({
                  title: "Use restaurant defaults?",
                  message: "This branch’s QR overrides will be removed and restaurant defaults will apply.",
                  confirmLabel: "Use defaults",
                })
              )
                try {
                  await QrAdminApi.inheritSettings(branch);
                  settings.reload();
                  showToast("Restaurant defaults restored.");
                } catch (e) {
                  showToast((e as Error).message);
                }
            }}
          >
            Use restaurant defaults
          </button>
        )}
      </div>
      {payments && (
        <div className={box}>
          <h2 className="font-bold flex items-center gap-2">
            <CreditCard size={18} />
            Secure payment collection
          </h2>
          <p role="status" className="mt-3 text-sm">
            {ready.data?.message || "Checking gateway readiness…"}
          </p>
          <div className="flex gap-2 mt-3 text-xs font-bold">
            <span className="bg-slate-100 rounded-full px-3 py-1">
              {ready.data?.provider || "Razorpay"}
            </span>
            <span className="bg-slate-100 rounded-full px-3 py-1">
              {ready.data?.mode || "Not configured"}
            </span>
            <span className="bg-slate-100 rounded-full px-3 py-1">
              {ready.data?.guestAvailable
                ? "Enabled for guests"
                : "Unavailable to guests"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            UPI and other methods are offered by the secure provider according
            to merchant activation. Configure credentials and collection
            approval through Super Admin. Secrets are never shown here.
          </p>
        </div>
      )}
      <div className={box + " space-y-4"}>
        {switches.map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between text-sm font-bold gap-4"
          >
            <span>{label}</span>
            <input
              type="checkbox"
              disabled={
                busy ||
                !settings.data ||
                (key === "allowOnlinePayment" &&
                  !ready.data?.available &&
                  !settings.data?.allowOnlinePayment)
              }
              checked={settings.data?.[key] ?? false}
              onChange={(e) => {
                const checked = e.target.checked;
                settings.setData((current) =>
                  current ? { ...current, [key]: checked } : current,
                );
                void save({ [key]: checked });
              }}
            />
          </label>
        ))}
        {payments && rules && (
          <label className="block text-xs font-bold">
            Payment instructions
            <textarea
              className={input}
              maxLength={300}
              value={rules.paymentInstructions}
              onChange={(e) => patch({ paymentInstructions: e.target.value })}
            />
            <button
              className={button}
              disabled={busy || !dirty}
              onClick={() => void save({ rules })}
            >
              Save payment instructions
            </button>
          </label>
        )}
      </div>
      {!payments && rules && (
        <div className={box + " space-y-5"}>
          <h2 className="font-bold flex items-center gap-2">
            <Clock size={18} />
            Hours, capacity & guest instructions
          </h2>
          <p className="text-xs text-slate-500">
            Hours use the restaurant timezone. Empty hours mean always open.
            Equal opening and closing times mean 24 hours. Overnight intervals
            are supported. Zero capacity limits mean unlimited.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {(
              [
                ["minimumOrderPaise", "Minimum order (INR)", 100],
                ["preparationMinutes", "Preparation estimate (minutes)", 1],
                ["maxPendingOrders", "Maximum pending QR orders", 1],
                ["maxOrdersPerWindow", "Orders per window", 1],
                ["windowMinutes", "Window duration (minutes)", 1],
              ] as const
            ).map(([key, label, scale]) => (
              <label key={key} className="text-xs font-bold">
                {label}
                <input
                  type="number"
                  min={key === "windowMinutes" ? 1 : 0}
                  max={key==='minimumOrderPaise'?100000:key==='preparationMinutes'||key==='windowMinutes'?240:10000}
                  step={scale === 100 ? ".01" : "1"}
                  aria-label={label}
                  className={input}
                  value={rules[key] / scale}
                  onChange={(e) =>
                    patch({ [key]: Math.round(Number(e.target.value) * scale) })
                  }
                />
              </label>
            ))}
            <label className="text-xs font-bold">
              Pause until (your device timezone)
              <input
                type="datetime-local"
                className={input}
                value={
                  rules.pausedUntil
                    ? new Date(
                        new Date(rules.pausedUntil).getTime() -
                          new Date(rules.pausedUntil).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  patch({
                    pausedUntil: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </label>
          </div>
          <label className="block text-xs font-bold">
            Customer instructions
            <textarea
              className={input}
              maxLength={500}
              value={rules.customerInstructions}
              onChange={(e) => patch({ customerInstructions: e.target.value })}
            />
          </label>
          <fieldset>
            <legend className="text-xs font-bold mb-2">Ordering modes</legend>
            <div className="flex gap-4">
              {(["DINE_IN", "TAKEAWAY"] as const).map((mode) => (
                <label className="flex gap-2 text-sm" key={mode}>
                  <input
                    type="checkbox"
                    checked={rules.orderingModes.includes(mode)}
                    onChange={(e) =>
                      patch({
                        orderingModes: e.target.checked
                          ? [...rules.orderingModes, mode]
                          : rules.orderingModes.filter((m) => m !== mode),
                      })
                    }
                  />
                  {mode.replace("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-bold">Ordering hours</legend>
            {rules.hours.map((h, i) => (
              <div key={i} className="flex gap-2 my-2 flex-wrap">
                <select
                  className="border rounded-lg p-2 text-sm"
                  aria-label={"Day " + (i + 1)}
                  value={h.day}
                  onChange={(e) =>
                    patch({
                      hours: rules.hours.map((v, n) =>
                        n === i ? { ...v, day: Number(e.target.value) } : v,
                      ),
                    })
                  }
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, n) => (
                    <option key={day} value={n}>
                      {day}
                    </option>
                  ))}
                </select>
                {(["open", "close"] as const).map((field) => (
                  <input
                    key={field}
                    type="time"
                    aria-label={field + " " + (i + 1)}
                    className="border rounded-lg p-2"
                    value={h[field]}
                    onChange={(e) =>
                      patch({
                        hours: rules.hours.map((v, n) =>
                          n === i ? { ...v, [field]: e.target.value } : v,
                        ),
                      })
                    }
                  />
                ))}
                <button
                  aria-label={"Remove hours " + (i + 1)}
                  className="text-rose-600 px-3"
                  onClick={() =>
                    patch({ hours: rules.hours.filter((_, n) => n !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="text-brand font-bold text-sm mt-2"
              disabled={rules.hours.length >= 21}
              onClick={() =>
                patch({
                  hours: [
                    ...rules.hours,
                    { day: 1, open: "09:00", close: "22:00" },
                  ],
                })
              }
            >
              + Add hours
            </button>
          </fieldset>
          <div className="flex gap-2">
            <button
              disabled={busy || !dirty}
              className={button}
              onClick={() => void save({ rules })}
            >
              <Save size={16} />
              Save ordering rules
            </button>
            {rules.pausedUntil && (
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void save({ rules: { ...rules, pausedUntil: null } })
                }
              >
                Resume now
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    {confirmDialog}
    </>
  );
}

const QR_ORDER_SOUND_KEY = "qr_admin_new_order_sound";
export function QrOperationalOrders({ showToast }: Props) {
  const [timeline,setTimeline]=useState<string|null>(null);
  const [view,setView]=useState('OPEN'),[cursor,setCursor]=useState(''),[previous,setPrevious]=useState<string[]>([]),[from,setFrom]=useState(''),[to,setTo]=useState('');
  useEffect(()=>{setCursor('');setPrevious([]);},[view,from,to]);
  const { confirm, prompt, confirmDialog } = useConfirm();
  const [branch, setBranch] = useState(scopedBranch),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL"),
    [detail, setDetail] = useState<QrOrderRow | null>(null),
    [busy, setBusy] = useState(false),
    [sound, setSound] = useState(() => {
      try {
        return localStorage.getItem(QR_ORDER_SOUND_KEY) === "1";
      } catch {
        return false;
      }
    });
  const branches = useData("branches", QrAdminApi.branches),
    orders = useData([branch,status,search,view,cursor,from,to].join(":"), () => QrAdminApi.orderPage({branchId:branch,status,search,view,cursor,from,to}), 5000),
    seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set(orders.data.rows.map((o) => o.id));
    if (
      sound &&
      seen.current &&
      orders.data.rows.some((o) => o.status === "NEW" && !seen.current!.has(o.id))
    ) {
      const audio = new AudioContext(),
        osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.connect(gain);
      gain.connect(audio.destination);
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(audio.currentTime + 0.2);
      osc.onended = () => void audio.close();
    }
    seen.current = ids;
  }, [orders.data, sound]);
  const list = orders.data?.rows ?? [];
  const action = async (o: QrOrderRow, type: string) => {
    let reason: string | undefined;
    if (type === "CANCELLED") {
      const entered = await prompt({
        title: "Cancel this order?",
        message: "The reason is recorded with the cancellation.",
        inputLabel: "Reason for cancellation",
        required: true,
        confirmLabel: "Cancel order",
        cancelLabel: "Keep order",
        tone: "danger",
      });
      reason = entered?.trim();
      if (!reason) return;
    }
    if (
      type === "COLLECT" &&
      !(await confirm({
        title: "Payment collected?",
        message: `Bill total ${money(o.total)}. Already collected ${money((o.balance?.collectedPaise??0)/100)}. Confirm ${money((o.balance?.outstandingPaise??Math.round(o.total*100))/100)} was received now.`,
        confirmLabel: "Yes, collected",
      }))
    )
      return;
    setBusy(true);
    try {
      await QrAdminApi.orderAction(o.id, type, o.version, reason);
      orders.reload();
      setDetail(null);
      showToast(
        type === "COLLECT" ? "Counter payment recorded." : "Order updated.",
      );
    } catch (e) {
      showToast((e as Error).message);
      orders.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
    <div className="space-y-4">
      <div className={box + " flex flex-wrap gap-4 items-end"}>
        <BranchSelect
          value={branch}
          onChange={v=>{setBranch(v);setCursor('');setPrevious([]);}}
          branches={branches.data}
        />
        <label className="text-xs font-bold flex-1 min-w-40">
          Order / table / guest
          <input
            type="search"
            className={input}
            value={search}
            onChange={(e) => {setSearch(e.target.value);setCursor('');setPrevious([]);}}
          />
        </label>
        <select
          aria-label="Order status"
          className={input + " !w-auto"}
          value={status}
          onChange={(e) => {setStatus(e.target.value);setCursor('');setPrevious([]);}}
        >
          {[
            "ALL",
            "DRAFT",
            "NEW",
            "PREPARING",
            "READY",
            "COMPLETED",
            "CANCELLED",
          ].map((s) => (
            <option key={s} value={s}>{({ALL:'All orders',DRAFT:'Awaiting payment',NEW:'Awaiting acceptance',PREPARING:'In kitchen',READY:'Ready to serve',COMPLETED:'Closed',CANCELLED:'Cancelled'} as Record<string,string>)[s]||s}</option>
          ))}
        </select>
        <label className="text-sm flex gap-2">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              const checked = e.target.checked;
              setSound(checked);
              try {
                localStorage.setItem(QR_ORDER_SOUND_KEY, checked ? "1" : "0");
              } catch {
                /* storage unavailable: the toggle still applies for this session */
              }
            }}
          />
          New-order sound
        </label>
        <button className={button} onClick={orders.reload}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <Failure error={orders.error} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="flex flex-wrap gap-3 items-end rounded-2xl border bg-white p-4"><label>Order view<select aria-label="Order view" className={input} value={view} onChange={e=>setView(e.target.value)}><option value="OPEN">Actionable orders</option><option value="DUE">Unpaid accepted bills</option><option value="ALL">All order history</option></select></label><label>From (restaurant date)<input className={input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (restaurant date)<input className={input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><span>{orders.data?.total??0} matching orders. Includes older unpaid bills.</span><button disabled={!previous.length} className={button} onClick={()=>{setCursor(previous.at(-1)||'');setPrevious(p=>p.slice(0,-1));}}>Previous orders</button><button className={button} disabled={!orders.data?.nextCursor} onClick={()=>{setPrevious(p=>[...p,cursor]);setCursor(orders.data?.nextCursor||'');}}>Next orders</button></div>
        {list.map((o) => (
          <article key={o.id} className={box}>
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-jaman-navy">
                  {o.orderNumber}
                </h3>
                {o.pickupAt && (
                  <p className="text-xs font-bold text-orange-800 mt-2">
                    Scheduled pickup:{" "}
                    {new Date(o.pickupAt).toLocaleString(undefined, {
                      timeZone: o.pickupTimezone,
                    })}
                  </p>
                )}
              </div>
              <span className="text-xs bg-jaman-ivory px-3 py-1 rounded-full h-fit">
                {o.status==='DRAFT'?'Awaiting payment':o.status.toLowerCase().replaceAll('_',' ')}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              {o.table ? "Table " + o.table : "Counter / takeaway"} ·{" "}
              {new Date(o.placedAt).toLocaleString()}
            </p>
            <p className="text-sm mt-2">
              {o.paymentStatus === "SUCCESS"
                ? "Paid"
                : o.paymentMethod === "CASH_AT_COUNTER"
                  ? "Due at counter"
                  : "Online payment pending"}{" "}
              · <b>{money(o.total)}</b>
            </p>
            <ul className="text-sm space-y-1 my-3">
              {o.items.slice(0, 3).map((i, n) => (
                <li key={n}>
                  {i.quantity} × {i.name}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <button
                className="text-brand font-bold text-sm"
                onClick={() => setDetail(o)}
              >
                Details
              </button><button className={button} onClick={()=>setTimeline(o.id)}>Timeline / payments</button>
              {o.status === "NEW" && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void action(o, "PREPARING")}
                >
                  Accept / prepare
                </button>
              )}
              {o.status === "PREPARING" && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void action(o, "READY")}
                >
                  Mark ready
                </button>
              )}
              {o.status === "READY" && (
                <button
                  disabled={busy || o.paymentStatus !== "SUCCESS"}
                  className={button}
                  onClick={() => void action(o, "COMPLETED")}
                >
                  Complete
                </button>
              )}
              {o.paymentMethod === "CASH_AT_COUNTER" &&
                o.paymentStatus !== "SUCCESS" &&
                !["CANCELLED", "DRAFT"].includes(o.status) && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() => void action(o, "COLLECT")}
                  >
                    Collect cash
                  </button>
                )}
            </div>
          </article>
        ))}
      </div>
      {!list.length && (
        <p className={box + " text-sm text-slate-500"}>
          No matching QR orders. New orders appear here every five seconds.
        </p>
      )}
      <QrOrderTimeline id={timeline} onClose={()=>setTimeline(null)}/>
      <Modal isOpen={!!detail} onClose={()=>setDetail(null)} title="QR order details">{detail && <div>            <h2 className="text-xl font-bold">
              {detail.orderNumber} · {detail.table}
            </h2>
            <ul className="my-4 space-y-3">
              {detail.items.map((i, n) => (
                <li key={n}>
                  <b>
                    {i.quantity} × {i.name}
                  </b>
                  <p className="text-sm text-slate-500">
                    {i.modifiers?.join(", ")} {i.specialInstructions}
                  </p>
                </li>
              ))}
            </ul>
            <p>{detail.notes}</p>
            <p className="font-bold my-3">
              {money(detail.total)} · {detail.paymentStatus}
            </p>
            <details>
              <summary>Status history</summary>
              {detail.history.map((h, i) => (
                <p key={i} className="text-xs mt-2">
                  {new Date(h.at).toLocaleString()} · {h.action} {h.reason}
                </p>
              ))}
            </details>
            {["NEW", "PREPARING", "READY"].includes(detail.status) &&
              detail.paymentStatus !== "SUCCESS" && (
                <button
                  disabled={busy}
                  className="text-rose-600 mt-4 text-sm font-bold"
                  onClick={() => void action(detail, "CANCELLED")}
                >
                  Cancel with reason
                </button>
              )}
            <p className="text-xs text-slate-500 mt-4">
              Paid cancellations require the existing Billing refund workflow.
            </p>
          </div>}</Modal>
    </div>
    {confirmDialog}
    </>
  );
}

export function QrAnalyticsView({
  paymentsOnly = false,
}: {
  paymentsOnly?: boolean;
}) {
  const today = formatRestaurantDate(new Date(), 'ISO_DATE'),
    [from, setFrom] = useState(
      formatRestaurantDate(new Date(Date.now() - 6 * 86400000), 'ISO_DATE'),
    ),
    [to, setTo] = useState(today),
    [branch, setBranch] = useState(scopedBranch);
  const branches = useData("branches", QrAdminApi.branches),
    stats = useData(
      [from, to, branch].join(":"),
      () => QrAdminApi.analytics(from, to, branch),
      30000,
    );
  const labels: Record<string, string> = {
    scans: "Code landing sessions",
    menuViews: "Menu-view sessions",
    itemAdds: "Item additions",
    conversion: "Orders / menu-view sessions",
    carts: "Cart sessions",
    checkoutStarts: "Checkout sessions",
    orders: "Accepted orders",
    completed: "Completed",
    cancelled: "Cancelled",
    pending: "Pending orders",
    preparing: "Preparing",
    grossOrderValue: "Accepted order value",
    grossSales: "Gross paid sales",
    netSales: "Net sales",
    collected: "Collected payments",
    outstandingCounter: "Outstanding at counter",
    refunded: "Successful refunds",
    averageOrderValue: "Average order value",
    onlineSuccess: "Online successes",
    onlineFailed: "Failed attempts",
    onlinePending: "Pending attempts",
    cashOrders: "Counter orders",
  };
  const metricKeys = paymentsOnly
    ? [
        "onlineSuccess",
        "onlineFailed",
        "onlinePending",
        "collected",
        "outstandingCounter",
      ]
    : Object.keys(labels);
  return (
    <div className="space-y-5">
      <div className={box + " flex flex-wrap gap-4"}>
        <label className="text-xs font-bold">
          From (restaurant date)
          <input
            type="date"
            className={input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold">
          To (restaurant date)
          <input
            type="date"
            className={input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches.data}
        />
      </div>
      {stats.data && <p className="text-xs text-slate-500">Timezone: {stats.data.timezone}. Calendar days run midnight to midnight and include both selected dates. UTC export boundaries: {stats.data.from} to {stats.data.to} (exclusive).</p>}
      <Failure error={stats.error} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {metricKeys.map((key) => (
          <div key={key} className={box}>
            <div className="text-xl font-bold text-jaman-navy">
              {stats.data
                ? [
                    "grossOrderValue",
                    "grossSales",
                    "netSales",
                    "collected",
                    "outstandingCounter",
                    "refunded",
                    "averageOrderValue",
                  ].includes(key)
                  ? money(stats.data.metrics[key])
                  : key === "conversion"
                    ? `${(100 * stats.data.metrics[key]).toFixed(1)}%`
                    : stats.data.metrics[key]
                : "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">{labels[key]}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Landing sessions and menu views are deduplicated per code, signed
        browser session and restaurant day. Accepted orders exclude online
        drafts and cancellations. Gross paid sales include collected counter
        payments and verified online payments. Net sales subtract successful
        partial or full refunds for these orders. Conversion is an
        order-to-session ratio and may exceed 100% when a guest orders again.
      </p>
      {!paymentsOnly && stats.data && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className={box}>
            <h3 className="font-bold mb-3">Order-value trend</h3>
            {stats.data.trend.map((row) => (
              <div key={row.date} className="text-sm mb-3">
                <div className="flex justify-between">
                  <span>
                    {row.date} · {row.orders} orders
                  </span>
                  <b>{money(row.sales)}</b>
                </div>
                <div className="h-2 rounded-full bg-jaman-ivory mt-1">
                  <div
                    className="h-2 rounded-full bg-brand"
                    style={{
                      width: `${(100 * row.sales) / Math.max(1, ...stats.data!.trend.map((r) => r.sales))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className={box}>
            <h3 className="font-bold mb-3">Popular dishes</h3>
            {stats.data.popular.map((row) => (
              <p className="text-sm flex justify-between my-2" key={row.name}>
                <span>{row.name}</span>
                <b>{row.quantity}</b>
              </p>
            ))}
            <h3 className="font-bold mt-5">By table / QR version</h3>
            {stats.data.byCode.map((row) => (
              <p className="text-sm my-2" key={row.codeId}>
                Table {row.table} · v{row.version}: {row.scans} visits ·{" "}
                {row.orders} orders · {money(row.sales)}
              </p>
            ))}
            <h3 className="font-bold mt-5">By branch</h3>
            {stats.data.byBranch.map((row) => (
              <p className="text-sm my-2" key={row.branchId}>
                {branches.data?.find((b) => b.id === row.branchId)?.name ||
                  row.branchId}
                : {row.orders} orders · {money(row.sales)}
              </p>
            ))}
          </div>
        </div>
      )}
      {stats.data && (
        <div className={box}>
          <h3 className="font-bold mb-3">Recent online payment attempts</h3>
          {stats.data.payments.length ? (
            stats.data.payments.map((p, n) => (
              <div
                key={n}
                className="flex flex-wrap justify-between gap-2 text-sm border-t py-3"
              >
                <span>{new Date(p.createdAt).toLocaleString()}</span>
                <b>{money(p.amount / 100)}</b>
                <span>{p.status}</span>
                <span className="text-xs text-slate-500">
                  {p.failureReason ||
                    p.providerPaymentId ||
                    "Awaiting provider"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No online attempts in this period.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function QrMenuAvailability({ showToast }: Props) {
  const [branch, setBranch] = useState(scopedBranch),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),[availabilityPage,setAvailabilityPage]=useState(0);
  useEffect(()=>setAvailabilityPage(0),[query,branch]);
  const branches = useData("branches", QrAdminApi.branches),
    menu = useData(branch, () => QrAdminApi.menuPreview(branch));
  const run = async (
    fn: () => Promise<unknown>,
    message = "Menu updated. Publish the catalog to release availability changes to guests.",
  ) => {
    setBusy(true);
    try {
      await fn();
      menu.reload();
      showToast(message);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={box + " space-y-4"}>
      <h2 className="font-bold text-lg">Publish & branch availability</h2>
      <p className="text-sm text-slate-500">
        {/^\/qr\//.test(location.pathname)
          ? // Solo-QR restaurants have no separate Restaurant Admin app, so QrCatalog's "Shared
            // menu editor" renders directly above this on the same page — this used to still say
            // "Edit dishes in Menu & Categories" with the link to it hidden, pointing guests at a
            // page that, in this exact context, both doesn't exist and isn't needed: the editor is
            // already right there.
            'Add, edit or remove dishes using Edit shared draft. This list controls published guest availability for each branch.'
          : 'Uses the same catalog, modifiers, taxes and branch availability as your restaurant. Publishing makes the current catalog available to guests.'}
      </p>
      {!/^\/qr\//.test(location.pathname) && (
        <a
          href={location.pathname.startsWith('/kiosk-admin/') ? '/kiosk-admin/menu' : '/restaurant-admin/menu'}
          className="text-brand font-bold text-sm"
        >
          Open Menu & Categories →
        </a>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <BranchSelect
          value={branch}
          onChange={setBranch}
          branches={branches.data}
        />
        <label className="text-xs font-bold flex-1">
          Search dishes
          <input
            className={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(QrAdminApi.publishMenu, "Menu published for guests.")
          }
        >
          Publish current menu
        </button>
      </div>
      <Failure error={menu.error} />
      {menu.data?.items
        .filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(availabilityPage*24,(availabilityPage+1)*24)
        .map((i) => (
          <div
            className="flex flex-wrap gap-3 items-center justify-between border-t py-3 text-sm"
            key={i.id}
          >
            <b>{i.name}</b>
            <span>Visible in preview</span>
            {branch && (
              <button
                className="text-rose-600"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    QrAdminApi.branchAvailability(branch, i.id, false),
                  )
                }
              >
                Mark unavailable
              </button>
            )}
          </div>
        ))}
      {menu.data?.hidden
        .filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(availabilityPage*24,(availabilityPage+1)*24)
        .map((i) => (
          <div
            key={i.itemId}
            className="flex flex-wrap justify-between gap-2 text-sm border-t py-3"
          >
            <span>
              {i.name} · {i.reason}
            </span>
            {branch && (
              <button
                className="text-emerald-700 font-bold"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    QrAdminApi.branchAvailability(branch, i.itemId, true),
                  )
                }
              >
                Restore branch availability
              </button>
            )}
          </div>
        ))}
      <div className="flex gap-3 items-center"><button className={button} disabled={!availabilityPage} onClick={()=>setAvailabilityPage(p=>p-1)}>Previous dishes</button><span>Page {availabilityPage+1}</span><button className={button} disabled={Math.max(menu.data?.items.filter(i=>i.name.toLowerCase().includes(query.toLowerCase())).length??0,menu.data?.hidden.filter(i=>i.name.toLowerCase().includes(query.toLowerCase())).length??0)<=(availabilityPage+1)*24} onClick={()=>setAvailabilityPage(p=>p+1)}>Next dishes</button></div>
    </div>
  );
}
