import type { NotificationRole } from '@jamanvaar/types';
import { NotificationRepository } from './repositories';

/**
 * Staff messages and bill requests between devices (BUG-099/100). They used to travel only as a
 * same-browser LAN-mesh event, so "Send Bill Request to Counter POS" and a message to the kitchen
 * reached nobody on another tablet. Each is now a small record queued here, pushed through the
 * cloud entity sync, and turned into a notification on the device it is meant for.
 */

export type ServiceMessageKind = 'MESSAGE' | 'BILL_REQUEST' | 'CALL_STAFF';
export type ServiceMessageRecipient = 'KITCHEN' | 'POS' | 'MANAGER' | 'CAPTAIN' | 'COUNTER' | 'ALL';
export type ServiceMessageReader = 'POS' | 'POS_ADMIN' | 'KDS' | 'CAPTAIN' | 'KIOSK_ADMIN';

export interface ServiceMessage {
  id: string;
  kind: ServiceMessageKind;
  recipient: ServiceMessageRecipient;
  senderName: string;
  presetText: string;
  customNote?: string;
  tableNumber?: string;
  /** BILL_REQUEST only: the table's open order, so the counter can load exactly that bill. */
  orderId?: string;
  /** BILL_REQUEST only: what the order owes right now, in rupees. */
  billAmount?: number;
  /** BILL_REQUEST only: "2× Paneer Tikka, 1× Naan", so the counter knows what it is printing. */
  billLines?: string;
  createdAt: string;
}

export interface ServiceMessageRecord {
  externalId: string;
  payload: Record<string, unknown>;
}

const STORAGE_KEY = 'jamanvaar_service_messages_v1';
/** Messages older than this are stale by the time a device that was off comes back. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_REMEMBERED = 500;

interface State {
  outbox: ServiceMessage[];
  /** Ids already handled on this device: received before, or sent from here. */
  seen: string[];
}

let memory: State = { outbox: [], seen: [] };
let loaded = false;

function load(): State {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      memory = { outbox: parsed.outbox ?? [], seen: parsed.seen ?? [] };
    }
  } catch {
    // Unreadable state simply starts empty.
  }
  return memory;
}

function save(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage unavailable — state stays in memory for this session.
  }
}

function remember(id: string): void {
  const state = load();
  state.seen.push(id);
  if (state.seen.length > MAX_REMEMBERED) state.seen = state.seen.slice(-MAX_REMEMBERED);
}

function isRecipientFor(reader: ServiceMessageReader, msg: ServiceMessage): boolean {
  // A guest at a self-order kiosk asking for help (BUG-137) goes to the people who staff the counter, the
  // kiosk console, and the captains actually walking the floor - not to the kitchen.
  if (msg.kind === 'CALL_STAFF') return reader === 'POS' || reader === 'POS_ADMIN' || reader === 'KIOSK_ADMIN' || reader === 'CAPTAIN';
  if (msg.recipient === 'ALL') return true;
  if (msg.kind === 'BILL_REQUEST') return reader === 'POS' || reader === 'POS_ADMIN';
  switch (reader) {
    case 'KDS': return msg.recipient === 'KITCHEN';
    case 'POS': return msg.recipient === 'POS';
    case 'POS_ADMIN': return msg.recipient === 'MANAGER';
    case 'CAPTAIN': return msg.recipient === 'CAPTAIN';
    case 'KIOSK_ADMIN': return false;
  }
}

function parse(raw: unknown): ServiceMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.recipient !== 'string' || typeof r.presetText !== 'string') return null;
  const created = typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN;
  if (Number.isNaN(created)) return null;
  return {
    id: r.id,
    kind: r.kind === 'BILL_REQUEST' ? 'BILL_REQUEST' : r.kind === 'CALL_STAFF' ? 'CALL_STAFF' : 'MESSAGE',
    recipient: r.recipient as ServiceMessageRecipient,
    senderName: typeof r.senderName === 'string' && r.senderName ? r.senderName : 'Floor staff',
    presetText: r.presetText,
    customNote: typeof r.customNote === 'string' && r.customNote ? r.customNote : undefined,
    tableNumber: typeof r.tableNumber === 'string' && r.tableNumber ? r.tableNumber : undefined,
    orderId: typeof r.orderId === 'string' && r.orderId ? r.orderId : undefined,
    billAmount: typeof r.billAmount === 'number' && Number.isFinite(r.billAmount) ? r.billAmount : undefined,
    billLines: typeof r.billLines === 'string' && r.billLines ? r.billLines : undefined,
    createdAt: r.createdAt as string
  };
}

/**
 * The one wording for a bill request, shared by the cloud message and the same-LAN event so a counter
 * shows the same notification whichever arrives first. Both use the message id as the notification id,
 * so the second arrival is ignored instead of showing the same bill twice.
 */
export function billRequestNotification(input: { requestId: string; tableNumber?: string; senderName: string; billAmount?: number; billLines?: string; orderId?: string; splitNote?: string; createdAt?: string; targetRoles: NotificationRole[] }) {
  // The title is what the counter acts on: which table, and how much to collect. The body is what was eaten.
  const table = input.tableNumber ? `Table ${input.tableNumber}` : 'Bill';
  const amount = input.billAmount !== undefined ? ` · ₹${input.billAmount.toFixed(2)} to pay` : '';
  const split = input.splitNote ? ` · split: ${input.splitNote}` : '';
  const who = `${input.senderName} asked for the bill`;
  return {
    id: `notif-${input.requestId}`,
    type: 'BILL_REQUESTED' as const,
    title: `🧾 ${table}${amount}`,
    message: input.billLines ? `${input.billLines} — ${who}${split}.` : `${who}${split}.`,
    priority: 'HIGH' as const,
    targetRoles: input.targetRoles,
    tableNumber: input.tableNumber,
    meta: { orderId: input.orderId, billAmount: input.billAmount },
    ...(input.createdAt ? { timestamp: input.createdAt } : {})
  };
}

export class ServiceMessages {
  /** Queue a message to be delivered to other devices. */
  public static enqueue(input: Omit<ServiceMessage, 'id' | 'createdAt'>): ServiceMessage {
    const state = load();
    const msg: ServiceMessage = {
      ...input,
      id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString()
    };
    state.outbox.push(msg);
    remember(msg.id); // never notify this device about its own message
    save();
    return msg;
  }

  public static collectSyncRecords(): ServiceMessageRecord[] {
    return load().outbox.map((m) => ({ externalId: m.id, payload: { ...m } }));
  }

  public static markPushed(records: ServiceMessageRecord[]): void {
    const state = load();
    const sent = new Set(records.map((r) => r.externalId));
    state.outbox = state.outbox.filter((m) => !sent.has(m.id));
    save();
  }

  /**
   * Handle one message pulled from the cloud. For a screen with a notification bell this raises a
   * notification; for Captain it returns the message so its inbox can show it. Returns null when it
   * is not for this device, was already handled, or is stale.
   */
  public static applyRemote(raw: Record<string, unknown>, reader: ServiceMessageReader): ServiceMessage | null {
    const msg = parse(raw);
    if (!msg) return null;
    const state = load();
    if (state.seen.includes(msg.id)) return null;
    if (Date.now() - Date.parse(msg.createdAt) > MAX_AGE_MS) return null;
    if (!isRecipientFor(reader, msg)) return null;

    remember(msg.id);
    save();
    // Captain shows it in its inbox and Kiosk Admin in its service-request list, rather than as a notification.
    if (reader === 'CAPTAIN' || reader === 'KIOSK_ADMIN') return msg;

    const roles: NotificationRole[] = [reader, 'ALL'];
    // A bill request is raised from its order, which carries the items and the amount (see refreshBillState). A bare
    // "asked for the bill" message from an older build would show the counter a table and no bill, so it raises nothing.
    if (msg.kind === 'BILL_REQUEST') return msg;
    const where = msg.tableNumber ? ` — Table ${msg.tableNumber}` : '';
    NotificationRepository.createNotification({
      id: `notif-${msg.id}`,
      type: 'MANAGER_ALERT',
      title: msg.kind === 'CALL_STAFF' ? `🙋 Guest needs help${where}` : `💬 Message from ${msg.senderName}${where}`,
      message: msg.customNote || msg.presetText,
      priority: 'HIGH',
      targetRoles: roles,
      tableNumber: msg.tableNumber,
      timestamp: msg.createdAt
    });
    return msg;
  }

  public static resetForTests(): void {
    memory = { outbox: [], seen: [] };
    loaded = true;
    save();
  }
}

