/**
 * Proof of WHO is at this terminal. After a staff member signs in with their PIN, the server hands back a signed session (and, for a
 * manager override, a short approval). The terminal keeps them here and stamps them onto the orders it syncs, so the server can read
 * the person's role from the proof instead of trusting a name typed on the terminal. Everything here is best effort: with no
 * connection the terminal still works from its local sign-in, and the server records those actions as "not proven".
 */
const KEY = 'jamanvaar_staff_session';
export interface RefundApprovalScope { action: 'REFUND'; paymentId: string; amountPaise: number; idempotencyKey: string }

interface Held {
  session?: { token: string; expiresAt: string; staffId: string; staffName: string; roleId: string };
  approval?: { token: string; expiresAt: string; staffName: string; scope?: RefundApprovalScope };
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

function load(): Held {
  try {
    return JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? '{}') as Held;
  } catch {
    return {};
  }
}

function save(h: Held): void {
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(h));
  } catch {
    /* storage unavailable: the proof lives only until reload */
  }
}

const alive = (expiresAt: string | undefined) => !!expiresAt && Date.parse(expiresAt) > Date.now();

async function post(fetcher: Fetcher, path: string, pin: string, scope?: RefundApprovalScope): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetcher(path, { method: 'POST', body: JSON.stringify({ pin, ...(scope ? { scope } : {}) }) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null; // offline or unreachable
  }
}

export class StaffSession {
  /** The signed session of whoever is signed in, or undefined when none is held (or it has expired). */
  static sessionToken(): string | undefined {
    const s = load().session;
    return s && alive(s.expiresAt) ? s.token : undefined;
  }

  /** The signed manager approval, valid for a few minutes after a manager override. */
  static approvalToken(): string | undefined {
    const a = load().approval;
    return a && alive(a.expiresAt) ? a.token : undefined;
  }

  static approvalScope(): RefundApprovalScope | undefined {
    const a = load().approval; return a && alive(a.expiresAt) ? a.scope : undefined;
  }

  /** Called after the local PIN check succeeds. Asks the server to sign the person in; a manager session is also a standing approval. */
  static async signIn(pin: string, fetcher: Fetcher): Promise<boolean> {
    const r = await post(fetcher, '/api/v1/staff/sign-in', pin);
    if (!r || typeof r.sessionToken !== 'string') {
      this.clear();
      return false;
    }
    save({ session: { token: r.sessionToken, expiresAt: String(r.expiresAt), staffId: String(r.staffId), staffName: String(r.staffName), roleId: String(r.roleId) } });
    return true;
  }

  /** Called after a manager override PIN is accepted on the terminal: asks the server for the approval to stamp onto that action. */
  static async approve(pin: string, fetcher: Fetcher, scope?: RefundApprovalScope): Promise<boolean> {
    const r = await post(fetcher, '/api/v1/staff/verify-manager-pin', pin, scope);
    if (!r || typeof r.approvalToken !== 'string') return false;
    save({ ...load(), approval: { token: r.approvalToken, expiresAt: String(r.approvalExpiresAt), staffName: String(r.staffName ?? ''), scope } });
    return true;
  }

  static clear(): void {
    save({});
  }
}
