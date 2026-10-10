import { useEffect, useState } from "react";
import { QrApi } from "./api";
export type LoyaltyAccount = {
  verified: boolean;
  verificationAvailable: boolean;
  phoneMasked?: string;
  points: number;
  message: string;
  program: { enabled: boolean; earnPoints: number; perRupeesSpent: number };
  rewards: Array<{
    id: string;
    name: string;
    description: string;
    pointsCost: number;
    discountAmount: number;
    eligible: boolean;
  }>;
};
export function LoyaltyPanel({
  token,
  session,
  rewardId,
  onReward,
}: {
  token: string;
  session: string;
  rewardId: string;
  onReward: (id: string) => void;
}) {
  const [account, setAccount] = useState<LoyaltyAccount | null>(null),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    QrApi.loyalty<LoyaltyAccount>(token, "", session)
      .then((a) => {
        if (active) setAccount(a);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, session]);
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
    <section className="loyalty-panel">
      <h3>
        Loyalty rewards <small>(optional)</small>
      </h3>
      {account ? (
        <>
          <p className="muted">{account.message}</p>
          {account.program.enabled && (
            <p>
              {account.program.earnPoints} point(s) per ₹
              {account.program.perRupeesSpent} on eligible verified purchases.
              Refunds reverse earned points.
            </p>
          )}
          {!account.verified && account.verificationAvailable && (
            <>
              <label>
                Indian mobile number
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your 10-digit mobile number"
                />
              </label>
              <button
                className="link"
                disabled={busy || !phone.trim()}
                onClick={() =>
                  void run(async () => {
                    await QrApi.loyalty(token, "/send-code", session, "POST", {
                      phone,
                    });
                    setSent(true);
                  })
                }
              >
                {sent
                  ? "Resend code (after 1 minute)"
                  : "Send verification code"}
              </button>
              {sent && (
                <>
                  <label>
                    6-digit verification code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </label>
                  <button
                    className="link"
                    disabled={busy || code.length !== 6}
                    onClick={() =>
                      void run(async () =>
                        setAccount(
                          await QrApi.loyalty<LoyaltyAccount>(
                            token,
                            "/verify",
                            session,
                            "POST",
                            { code },
                          ),
                        ),
                      )
                    }
                  >
                    Verify phone
                  </button>
                </>
              )}
            </>
          )}
          {account.verified && (
            <>
              <p role="status">
                <b>{account.points} points</b> · {account.phoneMasked}
              </p>
              <label>
                Redeem a reward?
                <select
                  aria-label="Redeem a reward?"
                  value={rewardId}
                  onChange={(e) => onReward(e.target.value)}
                >
                  <option value="">Keep my points for later</option>
                  {account.rewards.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.eligible}>
                      {r.name} · {r.pointsCost} points
                      {r.eligible ? "" : " (not enough points)"}
                    </option>
                  ))}
                </select>
              </label>
              {rewardId && (
                <p className="muted">
                  Points are reserved when you submit this order. You can remove
                  the reward before submitting. Coupons and rewards cannot be
                  combined.
                </p>
              )}
            </>
          )}
        </>
      ) : (
        !error && <p role="status">Loading loyalty options...</p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
