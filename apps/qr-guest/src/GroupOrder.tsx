import { useEffect, useState } from "react";
import { QrApi, type Describe, type Placed, type Quote } from "./api";
import { type Cart, toOrderItems } from "./cart";
type Group = {
  invitation: string;
  version: number;
  myVersion: number;
  isOwner: boolean;
  state: string;
  expiresAt: string;
  myItems: Array<{
    itemId: string;
    quantity: number;
    optionIds: string[];
    note?: string;
  }>;
  guests: Array<{
    label: string;
    items: Array<{
      itemId: string;
      quantity: number;
      optionIds: string[];
      note?: string;
    }>;
  }>;
  orderReference?: string;
  paymentResponsibility: string;
};
export function GroupOrder({
  token,
  session,
  cart,
  info,
  onPlaced,
}: {
  token: string;
  session: string;
  cart: Cart;
  info: Describe;
  onPlaced: (p: Placed) => Promise<void>;
}) {
  const [id, setId] = useState(() => {
      try {
        return sessionStorage.getItem("qr_group:" + token) ?? "";
      } catch {
        return "";
      }
    }),
    [group, setGroup] = useState<Group | null>(null),
    [invitation, setInvitation] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState<"CASH_AT_COUNTER" | "ONLINE">(
      info.ordering.settings.allowCash ? "CASH_AT_COUNTER" : "ONLINE",
    );
  const remember = (g: Group) => {
    setGroup(g);
    setId(g.invitation);
    try {
      sessionStorage.setItem("qr_group:" + token, g.invitation);
    } catch {}
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
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
  useEffect(() => {
    if (!id) return;
    let active = true;
    const refresh = async () => {
      try {
        const g = await QrApi.group<Group>(token, "/" + id, session);
        const lines = g.guests.flatMap((guest) => guest.items);
        const q = lines.length ? await QrApi.quote(token, lines) : null;
        if (active) {
          setGroup(g);
          setQuote(q);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [token, session, id]);
  return (
    <section className="group-panel">
      <h3>Ordering together?</h3>
      <p className="muted">
        Your personal cart remains yours. Join a shared bill only when someone
        at your table shares an invitation.
      </p>
      {!id ? (
        <div className="group-start">
          <button
            className="link"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                remember(await QrApi.group<Group>(token, "", session, "POST")),
              )
            }
          >
            Host a shared table order
          </button>
          <label>
            Invitation code
            <input
              value={invitation}
              maxLength={80}
              onChange={(e) => setInvitation(e.target.value)}
              placeholder="qg_..."
            />
          </label>
          <button
            className="link"
            disabled={busy || !invitation.trim()}
            onClick={() =>
              void run(async () =>
                remember(
                  await QrApi.group<Group>(
                    token,
                    "/" + encodeURIComponent(invitation.trim()) + "/join",
                    session,
                    "POST",
                  ),
                ),
              )
            }
          >
            Join this shared order
          </button>
        </div>
      ) : group ? (
        <>
          <p role="status">
            Session: {group.state.replaceAll("_", " ")} · {group.guests.length}{" "}
            guests
          </p>
          <p className="muted">{group.paymentResponsibility}</p>
          {group.state === "OPEN" && (
            <>
              <label>
                Share this invitation with people at your table
                <input
                  readOnly
                  value={group.invitation}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="link"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (navigator.clipboard)
                      await navigator.clipboard.writeText(group.invitation);
                    else
                      throw Error("Select and copy the invitation code above.");
                  })
                }
              >
                Copy invitation
              </button>
              <button
                className="primary"
                disabled={busy || !cart.lines.length}
                onClick={() =>
                  void run(async () =>
                    remember(
                      await QrApi.group<Group>(
                        token,
                        "/" + id + "/items",
                        session,
                        "PUT",
                        { items: toOrderItems(cart), version: group.myVersion },
                      ),
                    ),
                  )
                }
              >
                Save my cart to the shared bill
              </button>
              <p className="muted">
                Saving replaces only your own contribution. Personal checkout
                remains separate.
              </p>
            </>
          )}
          {group.guests.map((guest, i) => (
            <article key={i}>
              <h4>{guest.label}</h4>
              <p>
                {guest.items.length
                  ? guest.items
                      .map(
                        (line) =>
                          `${line.quantity} × ${quote?.lines.find((l) => l.itemId === line.itemId)?.name ?? "Menu item"}`,
                      )
                      .join(", ")
                  : "No items added yet"}
              </p>
            </article>
          ))}
          {quote && (
            <p>
              <b>Shared total: ₹{quote.total.toFixed(2)}</b> · Includes
              applicable tax
            </p>
          )}
          {group.isOwner && group.state === "OPEN" && quote && (
            <>
              <label>
                Host payment method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  {info.ordering.settings.allowCash && (
                    <option value="CASH_AT_COUNTER">
                      Pay shared bill at counter
                    </option>
                  )}
                  {info.ordering.settings.allowOnlinePayment && (
                    <option value="ONLINE">Pay shared bill online / UPI</option>
                  )}
                </select>
              </label>
              <button
                className="primary"
                disabled={busy || !info.ordering.enabled}
                onClick={() =>
                  void run(async () => {
                    const order = await QrApi.group<Placed>(
                      token,
                      "/" + id + "/submit",
                      session,
                      "POST",
                      {
                        version: group.version,
                        paymentMethod: method,
                        expectedTotalPaise: Math.round(quote.total * 100),
                      },
                    );
                    setGroup({
                      ...group,
                      state: "SUBMITTED",
                      orderReference: order.publicOrderId,
                    });
                    await onPlaced(order);
                  })
                }
              >
                I will pay ₹{quote.total.toFixed(2)} — submit shared order
              </button>
            </>
          )}
          {group.orderReference && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  onPlaced(await QrApi.status(group.orderReference!)),
                )
              }
            >
              View shared order / payment
            </button>
          )}
          {group.state === "LOCKED_FOR_CHECKOUT" && (
            <>
              <p role="status">
                Checkout is in progress. Contributions are locked. Refresh to
                recover the same order.
              </p>
              <button
                className="link"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const g = await QrApi.group<Group>(
                      token,
                      "/" + id,
                      session,
                    );
                    remember(g);
                    if (g.orderReference)
                      await onPlaced(await QrApi.status(g.orderReference));
                  })
                }
              >
                Check shared order
              </button>
              {group.isOwner && quote && (
                <button
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      onPlaced(
                        await QrApi.group<Placed>(
                          token,
                          "/" + id + "/submit",
                          session,
                          "POST",
                          {
                            version: group.version,
                            paymentMethod: method,
                            expectedTotalPaise: Math.round(quote.total * 100),
                          },
                        ),
                      ),
                    )
                  }
                >
                  Recover interrupted checkout
                </button>
              )}
            </>
          )}
          {group.state === "OPEN" && (
            <button
              className="link"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await QrApi.group(
                    token,
                    "/" + id + "/leave",
                    session,
                    "POST",
                  );
                  setId("");
                  setGroup(null);
                  try {
                    sessionStorage.removeItem("qr_group:" + token);
                  } catch {}
                })
              }
            >
              {group.isOwner
                ? "Close this shared session"
                : "Leave shared session and remove my contribution"}
            </button>
          )}
        </>
      ) : (
        <p>Loading shared session...</p>
      )}
      {(error || group?.state === "CLOSED" || group?.state === "SUBMITTED") && <button className="link" disabled={busy} onClick={() => { setId(""); setGroup(null); setError(""); try { sessionStorage.removeItem("qr_group:" + token); } catch {} }}>Start a new shared session</button>}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
    </section>
  );
}
