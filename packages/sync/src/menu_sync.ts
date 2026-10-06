import { MenuItemSync, CategorySync, ModifierGroupSync, TaxGroupSync, ComboSync, CouponSync, CustomerSync, FeedbackSync, ShiftSync, CashMovementSync, ReservationSync, type CollectionSync } from '@jamanvaar/database';
import { EntitySyncEngine } from './entity_sync';

/** The server accepts at most this many records per push. */
const PUSH_BATCH = 200;

/**
 * One sync tick for the menu (dishes and categories) - BUG-149. Order matters: local edits are stamped, what
 * other devices changed is applied (the newer change wins), and only then is what is still ahead of the cloud
 * pushed. The old tick pushed the whole local list first, so a device with a stale copy overwrote another
 * device's newer edit and then downloaded its own copy back. A device that does not edit the menu (Captain,
 * the self-order kiosk) passes `push: false` and only receives.
 *
 * Changes are marked as pushed only once the cloud confirmed every record, so a dropped connection simply
 * retries on the next tick.
 */
let inFlight: Promise<void> | null = null;
let menuAgain = false;
let menuPushNext = false;

export function syncMenuCatalog(opts: { push?: boolean } = {}): Promise<void> {
  // A slow connection must not let two ticks push the same changes twice.
  menuPushNext ||= opts.push !== false;
  if (inFlight) { menuAgain = true; return inFlight; }
  inFlight = (async () => {
    do {
      menuAgain = false;
      const push = menuPushNext; menuPushNext = false;
      await runTick(push);
    } while (menuAgain);
  })().finally(() => { inFlight = null; });
  return inFlight;
}

// Small catalogues only: an empty local copy means "start over", cheap for these. Not for shifts, customers or feedback, which can be large.
const SELF_HEALING_TYPES = new Set(['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'COMBO', 'COUPON']);

export async function syncCollection<T extends { updatedAt?: string }>(entityType: string, sync: CollectionSync<T>, push: boolean): Promise<void> {
  const readOnlyCatalog = !push && ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP'].includes(entityType);
  if (!readOnlyCatalog) sync.stampChanges();
  EntitySyncEngine.ensureCatalogIntegrity(entityType, id => sync.hasRecord(id));
  if (SELF_HEALING_TYPES.has(entityType) && sync.isEmpty()) EntitySyncEngine.restartFromBeginning(entityType);
  await EntitySyncEngine.catchUp(entityType, (remote) => sync.applyRemote(remote.payload, { authoritative: readOnlyCatalog }));
  if (!push) return;
  const records = sync.collectSyncRecords();
  for (let i = 0; i < records.length; i += PUSH_BATCH) {
    const batch = records.slice(i, i + PUSH_BATCH);
    const result = await EntitySyncEngine.pushSnapshot(entityType, batch);
    if (result.failed === 0 && result.processed === batch.length) sync.markPushed(batch);
    else break;
  }
}

async function runTick(push: boolean): Promise<void> {
  for (const type of ['TAX_GROUP', 'MODIFIER_GROUP', 'MENU_CATEGORY', 'MENU_ITEM']) EntitySyncEngine.registerWakeUp(type, () => syncMenuCatalog({ push }));
  // Tax and modifier groups first: a dish is only orderable by a guest once the groups it names are published too.
  await syncCollection('TAX_GROUP', TaxGroupSync, push);
  await syncCollection('MODIFIER_GROUP', ModifierGroupSync, push);
  await syncCollection('MENU_CATEGORY', CategorySync, push);
  await syncCollection('MENU_ITEM', MenuItemSync, push);
}

/**
 * Combos and coupons (BUG-130/133): Kiosk Admin builds them, the self-order kiosk sells with them. Kiosk Admin
 * pushes both; the kiosk only receives combos but also pushes coupons, because redeeming one changes its usage
 * count and that count has to get back to Kiosk Admin. The newest change wins, so a redemption counted on the
 * kiosk is not lost to an older copy and an edit in Kiosk Admin is not lost to a stale kiosk.
 */
let promotionsInFlight: Promise<void> | null = null;

export function syncPromotions(opts: { pushCombos: boolean; pushCoupons: boolean }): Promise<void> {
  for (const type of ['COMBO', 'COUPON']) EntitySyncEngine.registerWakeUp(type, () => syncPromotions(opts));
  if (!promotionsInFlight) {
    promotionsInFlight = (async () => {
      await syncCollection('COMBO', ComboSync, opts.pushCombos);
      await syncCollection('COUPON', CouponSync, opts.pushCoupons);
    })().finally(() => { promotionsInFlight = null; });
  }
  return promotionsInFlight;
}

/** Guest ratings (BUG-136): the self-order kiosk sends them, Kiosk Admin reads them. */
let feedbackInFlight: Promise<void> | null = null;

export function syncFeedback(opts: { push: boolean }): Promise<void> {
  if (!feedbackInFlight) feedbackInFlight = syncCollection('CUSTOMER_FEEDBACK', FeedbackSync, opts.push).finally(() => { feedbackInFlight = null; });
  return feedbackInFlight;
}

/** How many menu, category, combo and coupon changes have not reached the cloud yet (0 = everything is delivered). */
export function pendingCatalogChanges(): number {
  return MenuItemSync.collectSyncRecords().length + CategorySync.collectSyncRecords().length + ModifierGroupSync.collectSyncRecords().length + TaxGroupSync.collectSyncRecords().length + ComboSync.collectSyncRecords().length + CouponSync.collectSyncRecords().length;
}

/**
 * Sends the menu, combos and coupons to the cloud now and reports whether they really got there, so a screen can
 * say "published" only when it is true (BUG-138).
 */
export async function publishCatalogNow(): Promise<{ delivered: boolean; pending: number }> {
  // A tick already running may have started before the latest edit: let it finish, then run a fresh one.
  await inFlight?.catch(() => undefined);
  await syncMenuCatalog({ push: true });
  await promotionsInFlight?.catch(() => undefined);
  await syncPromotions({ pushCombos: true, pushCoupons: true });
  const pending = pendingCatalogChanges();
  return { delivered: pending === 0, pending };
}

/** Guests (BUG-159): the POS registers them, Restaurant Admin's CRM edits and reads them; both push and pull. */
let customersInFlight: Promise<void> | null = null;

export function syncCustomers(opts: { push: boolean }): Promise<void> {
  if (!customersInFlight) customersInFlight = syncCollection('CUSTOMER', CustomerSync, opts.push).finally(() => { customersInFlight = null; });
  return customersInFlight;
}

/**
 * Cash-drawer shifts (B2-056): only POS ever opens/edits its own shift, so this is push-from-POS,
 * pull-everywhere-else — Restaurant Admin (and any other terminal) passes `push: false`.
 */
let shiftsInFlight: Promise<void> | null = null;

export function syncShifts(opts: { push: boolean }): Promise<void> {
  if (!shiftsInFlight) {
    shiftsInFlight = (async () => {
      await syncCollection('SHIFT', ShiftSync, opts.push);
      await syncCollection('CASH_MOVEMENT', CashMovementSync, opts.push);
    })().finally(() => { shiftsInFlight = null; });
  }
  return shiftsInFlight;
}

/**
 * Bookings: Restaurant Admin and the POS both edit them (a counter can seat a booking or mark it no-show), so both push;
 * the Captain only reads them, to see which tables are being held.
 */
let reservationsInFlight: Promise<void> | null = null;

export function syncReservations(opts: { push: boolean }): Promise<void> {
  if (!reservationsInFlight) reservationsInFlight = syncCollection('RESERVATION', ReservationSync, opts.push).finally(() => { reservationsInFlight = null; });
  return reservationsInFlight;
}
