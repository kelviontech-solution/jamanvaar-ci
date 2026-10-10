import { useEffect, useState } from "react";
import { QrApi, type OperationsOptions } from "./api";
export function ServiceRequests({
  token,
  session,
}: {
  token: string;
  session: string;
}) {
  const [options, setOptions] = useState<OperationsOptions | null>(null),
    [rows, setRows] = useState<any[]>([]),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    QrApi.operations<OperationsOptions>(token, "", session)
      .then((r) => {
        if (active) setOptions(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, session]);
  useEffect(() => {
    if (!options?.serviceEnabled) return;
    let active = true;
    const refresh = () =>
      QrApi.operations<any[]>(token, "/requests", session)
        .then((r) => {
          if (active) setRows(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [options?.serviceEnabled, token, session]);
  const request = async (typeId: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await QrApi.operations<any>(
        token,
        "/requests",
        session,
        "POST",
        { typeId, note, idempotencyKey: crypto.randomUUID() },
      );
      setRows((prev) => [r, ...prev.filter((p) => p.id !== r.id)]);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!options?.serviceEnabled) return null;
  return (
    <section className="service-panel">
      <button
        className="link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Need something at your table?
      </button>
      {open && (
        <>
          <h2>Ask our team</h2>
          <label>
            Note <small>(optional)</small>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Tell us what you need"
            />
          </label>
          <div className="service-buttons">
            {options.requestTypes.map((t) => (
              <button
                className="chip"
                disabled={busy}
                key={t.id}
                onClick={() => void request(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="warn">
              {error}
            </p>
          )}
          <div role="status">
            {rows.slice(0, 5).map((r) => (
              <p key={r.id}>
                {r.label} · {r.status.replaceAll("_", " ").toLowerCase()}
                {r.overdue ? " · Waiting for our team" : ""}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
export function PickupSelector({
  token,
  session,
  onChange,
  onOptions,
}: {
  token: string;
  session: string;
  onChange: (s: string) => void;
  onOptions: (s: OperationsOptions) => void;
}) {
  const [options, setOptions] = useState<OperationsOptions | null>(null),
    [slots, setSlots] = useState<
      Array<{ at: string; label: string; remaining: number }>
    >([]),
    [chosen, setChosen] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const o = await QrApi.operations<OperationsOptions>(token, "", session);
        if (!active) return;
        setOptions(o);
        onOptions(o);
        if (o.pickupEnabled) {
          const r = await QrApi.operations<{ slots: typeof slots }>(
            token,
            "/slots",
            session,
          );
          if (active) {
            setSlots(r.slots);
            setError("");
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, session]);
  if (!options?.pickupEnabled && options?.asapEnabled) return null;
  return (
    <fieldset className="pickup-panel">
      <legend>When will you collect?</legend>
      <select
        aria-label="Pickup time"
        value={chosen}
        onChange={(e) => {
          setChosen(e.target.value);
          onChange(e.target.value);
        }}
      >
        <option value="">
          {options?.asapEnabled
            ? "As soon as possible"
            : "Choose a pickup time"}
        </option>
        {slots.map((s) => (
          <option key={s.at} value={s.at}>
            {s.label} · {s.remaining} slot(s) left
          </option>
        ))}
      </select>
      {options?.pickupInstructions && (
        <p className="muted">{options.pickupInstructions}</p>
      )}
      {!slots.length && !options?.asapEnabled && (
        <p className="warn">No pickup slots are currently available.</p>
      )}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
    </fieldset>
  );
}
