import { TableRepository, TableSync, ServiceMessages, type ServiceMessage, type ServiceMessageReader } from '@jamanvaar/database';
import { EntitySyncEngine } from './entity_sync';

/** The server accepts at most this many records per push. */
const PUSH_BATCH = 200;

/**
 * One sync tick for the shared floor plan (BUG-096/097), run by Restaurant Admin, POS and Captain:
 * record local edits, push the tables that changed, apply what other devices changed, then free
 * any table whose order was settled elsewhere. Changes are only marked as pushed once the cloud
 * confirmed every record, so a dropped connection just retries on the next tick.
 */
let inFlight: Promise<void> | null = null;
let again = false;

export function syncDiningTables(): Promise<void> {
  // A slow connection must not let two ticks push the same changes twice.
  if (inFlight) { again = true; return inFlight; }
  inFlight = (async () => { do { again = false; await runTick(); } while (again); })().finally(() => { inFlight = null; });
  return inFlight;
}

async function runTick(): Promise<void> {
  EntitySyncEngine.registerWakeUp('DINING_TABLE', syncDiningTables);
  TableSync.stampChanges();

  const records = TableSync.collectSyncRecords();
  for (let i = 0; i < records.length; i += PUSH_BATCH) {
    const batch = records.slice(i, i + PUSH_BATCH);
    const result = await EntitySyncEngine.pushSnapshot('DINING_TABLE', batch);
    if (result.failed === 0 && result.processed === batch.length) TableSync.markPushed(batch);
    else break;
  }

  if (TableRepository.getAllTables().length === 0) EntitySyncEngine.restartFromBeginning('DINING_TABLE');
  await EntitySyncEngine.catchUp('DINING_TABLE', (remote) => TableSync.applyRemote(remote.payload));
  TableRepository.releaseSettledTables();
  TableRepository.reconcileQrTableOrders();
  // The release above is a local change, so record it now rather than one tick later.
  TableSync.stampChanges();
}

/**
 * Delivers staff messages and bill requests (BUG-099/100): pushes what this device queued, applies
 * what arrived for it, and returns the messages Captain should show in its inbox (other roles see
 * theirs as notifications, already raised).
 */
export async function syncServiceMessages(reader: ServiceMessageReader): Promise<ServiceMessage[]> {
  await pushServiceMessages();

  const inbound: ServiceMessage[] = [];
  await EntitySyncEngine.catchUp('SERVICE_MESSAGE', (remote) => {
    const applied = ServiceMessages.applyRemote(remote.payload, reader);
    if (applied && (reader === 'CAPTAIN' || reader === 'KIOSK_ADMIN')) inbound.push(applied);
  });
  return inbound;
}

/**
 * Sends the messages this device queued (a self-order kiosk only sends). Returns true only when everything
 * queued has really been delivered to the cloud - a caller that tells a guest "a team member is on the way"
 * must check this first (BUG-137).
 */
export async function pushServiceMessages(): Promise<boolean> {
  const records = ServiceMessages.collectSyncRecords();
  for (let i = 0; i < records.length; i += PUSH_BATCH) {
    const batch = records.slice(i, i + PUSH_BATCH);
    const result = await EntitySyncEngine.pushSnapshot('SERVICE_MESSAGE', batch);
    if (result.failed === 0 && result.processed === batch.length) ServiceMessages.markPushed(batch);
    else return false;
  }
  return true;
}
