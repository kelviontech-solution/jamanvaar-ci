import { QrOnlinePaymentSetup } from './QrOnlinePaymentSetup';
import { useQrScope } from './QrScope';
import { QrPayoutBank } from './QrPayoutBank';
import {QrOrderAttention} from './QrOrderAttention';
import {QrGuestDetails} from './QrGuestDetails';
import { QrOrderTimeline } from './QrWorkflows';
import { Modal } from '@jamanvaar/ui';
import { useQrUnsavedChanges } from './useQrUnsavedChanges';
import { activeAdminBranch } from "../../adminBranchScope";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Printer, Save, RefreshCw, Palette, Clock } from "lucide-react";
import {
  QrAdminApi,
  type QrBranch,
  type QrPrintData,
  type QrPrintDesign,
  type QrRules,
  type QrOrderRow,
  type QrAnalytics,
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
import { QR_BUTTON, QR_FIELD } from './qrUi';

const scopedBranch = () => activeAdminBranch ? (activeAdminBranch === 'all' ? '' : activeAdminBranch) :
  new URLSearchParams(location.search).has('setupBranch')
    ? (new URLSearchParams(location.search).get('setupBranch') === 'restaurant' ? '' : new URLSearchParams(location.search).get('setupBranch') || '')
    : "";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
const input = QR_FIELD;
const button = QR_BUTTON;
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
  const scope = useQrScope();
  if (scope.managed) return null;
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
              // A real miniature of the actual card -- border style, accent band, photo-frame
              // shape, dark-vs-light layout -- not a flat colour swatch. The nine options used to
              // differ only by background colour here, so every design looked identical in shape
              // and a restaurant owner had no way to tell "Premium" from "Fine dining" without
              // picking each one and checking the separate preview panel.
              const thumbSvg = samplePreview ? designSvg(samplePreview, { ...DEFAULT_DESIGN, template: t.id, accent: t.color }) : null;
              return (
                <button
                  key={t.id}
                  aria-pressed={isSelected}
                  onClick={() => patch({ template: t.id, accent: t.color })}
                  className={`relative overflow-hidden rounded-xl border text-left text-sm transition-all ${isSelected ? "ring-2 ring-brand border-brand shadow-sm" : "border-jaman-border hover:border-slate-300"}`}
                >
                  {/* The full card is a 640x860 portrait (logo, name, QR, footer). Forcing both the
                      SVG's width AND height to fill this short wide box independently stretched
                      every element unevenly -- the QR's own finder squares and the footer text
                      warped into illegible marks. Scaling by width only (h-auto) keeps the design
                      undistorted; aspect-[640/240] fixes the crop window to exactly viewBox y 0-240
                      (640 * 240/640 = 240) regardless of rendered width, which is the header/accent
                      band every design actually differs in, landing well above the QR at y=250 --
                      so the crop can never catch a half-rendered code or text. */}
                  {/* dangerouslySetInnerHTML below wraps the svg in its own div, so it's a
                      grandchild here, not a direct child -- [&_svg] (descendant) reaches it;
                      [&>svg] silently matched nothing and let the svg render at its native
                      640x860px, relying on luck rather than the crop math above. */}
                  <div className="aspect-[640/240] w-full overflow-hidden bg-jaman-ivory [&_svg]:block [&_svg]:w-full [&_svg]:h-auto" aria-hidden="true">
                    {thumbSvg ? (
                      <div dangerouslySetInnerHTML={{ __html: thumbSvg }} />
                    ) : (
                      <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)` }} />
                    )}
                  </div>
                  <div className="relative flex items-center justify-between p-3">
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
  const settings = useData(branch, () => QrAdminApi.settings(branch));
  const [rules, setRules] = useState<QrRules | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),[saveError,setSaveError]=useState('');
  useEffect(() => {
    // Q02: this used to run unconditionally on every `settings.data` change, including the one
    // triggered by a switch's own save-and-reload below — so flipping an unrelated switch (e.g.
    // "Send accepted orders straight to the kitchen") silently overwrote an in-progress, unsaved
    // edit to Preparation estimate (or any other rules field) and disabled Save ordering rules as
    // if nothing had ever been typed. Skip the sync while there's a real unsaved draft.
    if (settings.data?.rules && !dirty) {
      setRules(settings.data.rules);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);
  useQrUnsavedChanges(dirty);
  const save = async (body: Parameters<typeof QrAdminApi.saveSettings>[0]) => {
    setBusy(true);
    setSaveError('');showToast('Saving settings…');
    try {
      await QrAdminApi.saveSettings(body, branch);
      setDirty(false);
      settings.reload();
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
  /**
   * Switches save instantly (no explicit Save button), unlike the staged `rules` draft above.
   * Q03: the old inline handler flipped `settings.data` optimistically and never reverted it on a
   * failed save — a rejected PUT left the toggle showing the new, never-actually-applied value
   * right alongside the error, instead of the real server state. Also skips `settings.reload()`
   * on success (Q02): reloading the whole settings object here is exactly what fed a stale
   * `rules.rules` back into the effect above and clobbered an unrelated unsaved draft.
   */
  const saveSwitch = async (
    key: "allowOnlinePayment" | "allowCash" | "orderingEnabled" | "autoAccept" | "menuOnlyEnabled",
    checked: boolean
  ) => {
    const previous = settings.data?.[key];
    setBusy(true);
    setSaveError("");
    settings.setData((current) => (current ? { ...current, [key]: checked } : current));
    try {
      await QrAdminApi.saveSettings({ [key]: checked }, branch);
      showToast("Settings saved.");
    } catch (e) {
      settings.setData((current) => (current ? { ...current, [key]: previous } : current));
      setSaveError((e as Error).message);
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    ? [["allowCash", "Cash at Counter"]]
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
            ) {
              setDirty(false);
              setRules(null);
              setBranch(v);
            }
          }}
          branches={branches.data}
        />
        <p className="text-xs text-slate-500 mt-2">
          Restaurant defaults apply until a branch overrides a setting. Other
          branches keep their own configuration.
        </p>
        <Failure error={saveError || settings.error} />
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
                  setDirty(false);
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
      {payments && <QrOnlinePaymentSetup key={branch} branch={branch} onSaved={() => settings.reload()} />}
      {payments && <QrPayoutBank />}
      <div className={box + " space-y-4"}>
        {switches.map(([key, label]) => (
          <div key={key}>
            <label className="flex items-center justify-between text-sm font-bold gap-4">
              <span>{label}</span>
              <input
                type="checkbox"
                disabled={
                  busy ||
                  !settings.data
                }
                checked={settings.data?.[key] ?? false}
                onChange={(e) => void saveSwitch(key, e.target.checked)}
              />
            </label>

          </div>
        ))}
        {payments && rules && (
          <label className="block text-xs font-bold">
            Payment instructions
            <textarea
              aria-label="Payment instructions"
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
              {busy ? 'Saving…' : 'Save payment instructions'}
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
          <div className="flex gap-2 qr-rule-save">
            <button
              disabled={busy || !dirty}
              className={button}
              onClick={() => void save({ rules })}
            >
              <Save size={16} />
              {busy ? 'Saving…' : 'Save ordering rules'}
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
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {try{return localStorage.getItem('qr_order_density') === 'compact' ? 'compact' : 'comfortable';}catch{return 'comfortable';}});
  const [orderLinkError, setOrderLinkError] = useState('');
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
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('order');
    if (!id) return;
    let active = true;
    void QrAdminApi.orderPage({branchId:branch,search:id,view:'ALL'}).then(result => {
      if (!active) return;
      const order = result.rows.find(row => row.id === id);
      if (order) {setDetail(order);setOrderLinkError('');} else setOrderLinkError('This order is unavailable in the selected branch.');
    }).catch(error => {if(active)setOrderLinkError(error.message);});
    return () => {active=false;};
  }, [branch]);
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
    <div className={'space-y-4 qr-orders-workspace qr-orders--'+density}>
      <QrOrderAttention key={branch} branchId={branch} compact={density === 'compact'} onOpenOrder={async id=>{
        const result=await QrAdminApi.orderPage({branchId:branch,search:id,view:'ALL'});
        const order=result.rows.find(row=>row.id===id);
        if(!order)throw new Error('This order is no longer available in this branch. Refresh the orders list.');
        setDetail(order);
      }}/>
      <div className={box + " flex flex-wrap gap-4 items-end qr-order-toolbar"}>
        <BranchSelect
          value={branch}
          onChange={v=>{setBranch(v);setCursor('');setPrevious([]);}}
          branches={branches.data}
        />
        <label className="text-xs font-bold flex-1 min-w-40 qr-order-search">
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
        <label className="text-sm flex gap-2 qr-order-sound">
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
        <button className={button + ' qr-order-refresh'} onClick={orders.reload}>
          <RefreshCw size={16} />
          Refresh
        </button>
        <label className="text-xs font-bold qr-order-density">Order layout<select aria-label="Order layout" className={input} value={density} onChange={event => {const next=event.target.value as typeof density;setDensity(next);try{localStorage.setItem('qr_order_density',next);}catch{}}}><option value="comfortable">Comfortable cards</option><option value="compact">Compact service view</option></select></label>
      </div>
      <Failure error={orders.error} />
      <Failure error={orderLinkError || null} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <details className="col-span-full qr-order-filters rounded-2xl border bg-white p-4"><summary>Filter dates &amp; order history</summary><div className="flex flex-wrap gap-3 items-end mt-3"><label>Order view<select aria-label="Order view" className={input} value={view} onChange={e=>setView(e.target.value)}><option value="OPEN">Actionable orders</option><option value="DUE">Unpaid accepted bills</option><option value="ALL">All order history</option></select></label><label>From (restaurant date)<input className={input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (restaurant date)<input className={input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><span>{orders.data?.total??0} matching orders. Includes older unpaid bills.</span><button disabled={!previous.length} className={button} onClick={()=>{setCursor(previous.at(-1)||'');setPrevious(p=>p.slice(0,-1));}}>Previous orders</button><button className={button} disabled={!orders.data?.nextCursor} onClick={()=>{setPrevious(p=>[...p,cursor]);setCursor(orders.data?.nextCursor||'');}}>Next orders</button></div></details>
        {list.map((o) => (
          <article key={o.id} className={box+' qr-order-card'}>
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
            {(o.customerName||o.customerPhone)&&<p className="text-sm mt-2 font-semibold">Guest: {[o.customerName,o.customerPhone].filter(Boolean).join(" / ")}</p>}
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
      {!list.length && orders.data && !orders.error && (
        <p className={box + " text-sm text-slate-500"}>
          No matching QR orders. New orders appear here every five seconds.
        </p>
      )}
      {!orders.data && !orders.error && <p role="status">Loading QR orders…</p>}
      <QrOrderTimeline id={timeline} onClose={()=>setTimeline(null)}/>
      <Modal isOpen={!!detail} onClose={()=>setDetail(null)} title="QR order details">{detail && <div>            <h2 className="text-xl font-bold">
              {detail.orderNumber} · {detail.table}
            </h2>
            <QrGuestDetails order={detail}/><ul className="my-4 space-y-3">
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

const FUNNEL_KEYS = ["scans", "menuViews", "itemAdds", "carts", "checkoutStarts", "orders"];
const STATUS_KEYS = ["completed", "preparing", "pending", "cancelled"];
const STATUS_COLORS: Record<string, string> = {
  completed: "#00A99D",
  preparing: "#BF540F",
  pending: "#E66817",
  cancelled: "#E11D48",
};
const REVENUE_KEYS = [
  "grossOrderValue",
  "grossSales",
  "netSales",
  "collected",
  "outstandingCounter",
  "refunded",
  "averageOrderValue",
];
const PAYMENT_TILE_KEYS = ["onlineSuccess", "onlineFailed", "onlinePending", "cashOrders"];

function FunnelChart({
  metrics,
  labels,
}: {
  metrics: Record<string, number>;
  labels: Record<string, string>;
}) {
  const base = Math.max(1, metrics[FUNNEL_KEYS[0]] ?? 0);
  return (
    <div className={box}>
      <h3 className="font-bold mb-1">Ordering funnel</h3>
      <p className="text-xs text-slate-500 mb-4">
        How guests move from scanning a code to a placed order.
      </p>
      <div className="space-y-2.5">
        {FUNNEL_KEYS.map((key, i) => {
          const count = metrics[key] ?? 0;
          const pct = Math.round((100 * count) / base);
          const prevKey = i > 0 ? FUNNEL_KEYS[i - 1] : null;
          const prev = prevKey ? (metrics[prevKey] ?? 0) : null;
          const drop = prev && prev > 0 ? Math.round((100 * (prev - count)) / prev) : null;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-slate-600">{labels[key]}</span>
                <span className="font-bold text-jaman-navy">
                  {count}
                  {drop !== null && drop > 0 && (
                    <span className="ml-2 text-xs font-normal text-rose-600">-{drop}%</span>
                  )}
                </span>
              </div>
              <div className="h-3 rounded-full bg-jaman-ivory mt-1">
                <div
                  className="h-3 rounded-full bg-brand"
                  style={{ width: `${count > 0 ? Math.max(pct, 3) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-4">
        Conversion (orders ÷ menu views):{" "}
        <b className="text-jaman-navy">{(100 * (metrics.conversion ?? 0)).toFixed(1)}%</b>
      </p>
    </div>
  );
}

function StatusDonut({ metrics }: { metrics: Record<string, number> }) {
  const total = STATUS_KEYS.reduce((sum, k) => sum + (metrics[k] ?? 0), 0);
  const circumference = 2 * Math.PI * 70;
  let acc = 0;
  return (
    <div className={box}>
      <h3 className="font-bold mb-4">Order status</h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative w-[160px] h-[160px] shrink-0 mx-auto">
          <svg viewBox="0 0 180 180" width="160" height="160">
            <g transform="rotate(-90 90 90)">
              <circle cx="90" cy="90" r="70" fill="none" stroke="#EBE6DD" strokeWidth="24" />
              {total > 0 &&
                STATUS_KEYS.map((key) => {
                  const value = metrics[key] ?? 0;
                  const len = (value / total) * circumference;
                  const el =
                    len > 0 ? (
                      <circle
                        key={key}
                        cx="90"
                        cy="90"
                        r="70"
                        fill="none"
                        stroke={STATUS_COLORS[key]}
                        strokeWidth="24"
                        strokeDasharray={`${len} ${circumference - len}`}
                        strokeDashoffset={-acc}
                      />
                    ) : null;
                  acc += len;
                  return el;
                })}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-jaman-navy">{total}</span>
            <span className="text-xs text-slate-500">orders</span>
          </div>
        </div>
        <div className="space-y-2 text-sm flex-1 min-w-[160px]">
          {STATUS_KEYS.map((key) => {
            const value = metrics[key] ?? 0;
            const pct = total > 0 ? Math.round((100 * value) / total) : 0;
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-slate-600 capitalize">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[key] }} />
                  {key}
                </span>
                <span className="font-bold text-jaman-navy">
                  {value} <span className="font-normal text-slate-400">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrendChart({ trend }: { trend: QrAnalytics["trend"] }) {
  if (!trend.length) return <p className="text-sm text-slate-500">No orders in this period.</p>;
  const w = 600, h = 160, padL = 4, padR = 4, padT = 12, padB = 22;
  const maxSales = Math.max(1, ...trend.map((r) => r.sales));
  const peak = trend.reduce((best, r) => (r.sales > best.sales ? r : best), trend[0]);
  const stepX = trend.length > 1 ? (w - padL - padR) / (trend.length - 1) : 0;
  const points = trend.map((r, i) => ({
    x: padL + stepX * i,
    y: padT + (h - padT - padB) * (1 - r.sales / maxSales),
    r,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)} ${h - padB} L${points[0].x.toFixed(1)} ${h - padB} Z`;
  const tickIdx =
    points.length <= 5 ? points.map((_, i) => i) : [0, Math.round((points.length - 1) / 2), points.length - 1];
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none">
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="#EBE6DD" strokeWidth="1" />
        <path d={areaPath} fill="#BF540F" opacity="0.1" />
        <path d={linePath} fill="none" stroke="#BF540F" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#FFFFFF" stroke="#BF540F" strokeWidth="2" />
        ))}
        {tickIdx.map((i) => (
          <text
            key={i}
            x={points[i].x}
            y={h - 6}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="10"
            fill="#64748b"
          >
            {new Date(trend[i].date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </text>
        ))}
      </svg>
      <p className="text-xs text-slate-500 mt-2">
        Peak day: {new Date(peak.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
        <b className="text-jaman-navy">{money(peak.sales)}</b>
      </p>
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
      {(() => {
        const renderTile = (key: string) => (
          <div key={key} className={box}>
            <div className="text-xl font-bold text-jaman-navy">
              {stats.data
                ? REVENUE_KEYS.includes(key)
                  ? money(stats.data.metrics[key])
                  : key === "conversion"
                    ? `${(100 * stats.data.metrics[key]).toFixed(1)}%`
                    : stats.data.metrics[key]
                : "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">{labels[key]}</div>
          </div>
        );
        return paymentsOnly ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {metricKeys.map(renderTile)}
          </div>
        ) : (
          <>
            {stats.data && (
              <div className="grid lg:grid-cols-2 gap-4">
                <FunnelChart metrics={stats.data.metrics} labels={labels} />
                <StatusDonut metrics={stats.data.metrics} />
              </div>
            )}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Revenue</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {REVENUE_KEYS.map(renderTile)}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Payments</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {PAYMENT_TILE_KEYS.map(renderTile)}
              </div>
            </div>
          </>
        );
      })()}
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
            <TrendChart trend={stats.data.trend} />
          </div>
          <div className={box}>
            <h3 className="font-bold mb-3">Popular dishes</h3>
            {stats.data.popular.length ? (
              (() => {
                const maxQty = Math.max(1, ...stats.data!.popular.map((r) => r.quantity));
                return stats.data!.popular.map((row) => (
                  <div key={row.name} className="text-sm mb-2.5">
                    <div className="flex justify-between">
                      <span>{row.name}</span>
                      <b>{row.quantity}</b>
                    </div>
                    <div className="h-1.5 rounded-full bg-jaman-ivory mt-1">
                      <div
                        className="h-1.5 rounded-full bg-jaman-teal"
                        style={{ width: `${(100 * row.quantity) / maxQty}%` }}
                      />
                    </div>
                  </div>
                ));
              })()
            ) : (
              <p className="text-sm text-slate-500">No items ordered in this period.</p>
            )}
            <h3 className="font-bold mt-5">By table / QR version</h3>
            {stats.data.byCode.length ? (
              stats.data.byCode.map((row) => (
                <p className="text-sm my-2" key={row.codeId}>
                  Table {row.table} · v{row.version}: {row.scans} visits ·{" "}
                  {row.orders} orders · {money(row.sales)}
                </p>
              ))
            ) : (
              <p className="text-sm text-slate-500">No table or QR code activity in this period.</p>
            )}
            <h3 className="font-bold mt-5">By branch</h3>
            {stats.data.byBranch.length ? (
              stats.data.byBranch.map((row) => (
                <p className="text-sm my-2" key={row.branchId}>
                  {branches.data?.find((b) => b.id === row.branchId)?.name ||
                    row.branchId}
                  : {row.orders} orders · {money(row.sales)}
                </p>
              ))
            ) : (
              <p className="text-sm text-slate-500">No branch activity in this period.</p>
            )}
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
