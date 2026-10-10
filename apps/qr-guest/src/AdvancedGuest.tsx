import { useEffect, useState } from "react";
import { QrApi, type Placed } from "./api";

export function OrderFeedback({ order }: { order: Placed }) {
  const [rating, setRating] = useState(5),
    [comment, setComment] = useState(""),
    [state, setState] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="feedback-panel">
      <h3>How was your meal?</h3>
      <p className="muted">Optional private feedback for the restaurant.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await QrApi.feedback(order.publicOrderId, rating, comment);
            setState("Thank you. Your feedback has been sent.");
          } catch (err) {
            setState(
              err instanceof Error
                ? err.message
                : "Feedback could not be sent.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend>Your rating</legend>
          <div className="chips">
            {[1, 2, 3, 4, 5].map((n) => (
              <label className="opt" key={n}>
                <input
                  type="radio"
                  name="rating"
                  checked={rating === n}
                  onChange={() => setRating(n)}
                />
                <span>
                  {n} star{n !== 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Comments <small>(optional)</small>
          <textarea
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Food, service or anything we could improve"
          />
        </label>
        <button
          className="primary"
          disabled={busy || state.startsWith("Thank you")}
        >
          {busy ? "Sending..." : "Send feedback"}
        </button>
      </form>
      {state && <p role="status">{state}</p>}
    </section>
  );
}

export function GuestHistory({
  token,
  session,
  onRecover,
  onReorder,
}: {
  token: string;
  session: string;
  onRecover: (id: string) => void;
  onReorder: (
    items: Awaited<ReturnType<typeof QrApi.history>>[number]["items"],
  ) => void;
}) {
  const [open, setOpen] = useState(false),
    [orders, setOrders] = useState<Awaited<ReturnType<typeof QrApi.history>>>(
      [],
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    QrApi.history(token, session)
      .then((rows) => {
        if (active) setOrders(rows);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [open, token, session]);
  return (
    <section className="history-panel">
      <button
        className="link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide previous orders" : "My previous orders on this device"}
      </button>
      {open && (
        <>
          <p className="muted">
            Only orders placed by this browser at this branch. Reordering
            creates a cart for you to review.
          </p>
          {error && <p role="alert">{error}</p>}
          {!orders.length && !error && <p>No previous orders yet.</p>}
          {orders.map((order) => (
            <article key={order.publicOrderId}>
              <h3>
                {order.orderNumber}{" "}
                <small>{new Date(order.createdAt).toLocaleDateString()}</small>
              </h3>
              <p>
                {order.status} · {order.paymentStatus} · ₹
                {order.total.toFixed(2)}
              </p>
              <button
                className="link"
                onClick={() => onRecover(order.publicOrderId)}
              >
                View order / receipt
              </button>
              <button className="link" onClick={() => onReorder(order.items)}>
                Add to a new cart
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
