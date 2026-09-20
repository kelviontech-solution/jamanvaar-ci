import { z } from 'zod';

// STAFF_USER (BUG-019/034/035): a staff PIN issued in Restaurant Admin used to work only on the device
// that created it — POS, Captain, KDS and Kiosk each keep their own local-first `db.users`, and nothing
// synced staff records between them, despite the UI's promise that the PIN works on all of them. Carries
// the restaurant-keyed PIN hash (see packages/database/src/pin.ts), never a plaintext PIN.
export const SYNCABLE_ENTITY_TYPES = ['CUSTOMER', 'INVENTORY_ITEM', 'PAYMENT_TRANSACTION', 'MENU_ITEM', 'MENU_CATEGORY', 'STAFF_USER'] as const;
export type SyncableEntityType = (typeof SYNCABLE_ENTITY_TYPES)[number];

export const entitySyncEventSchema = z.object({
  externalId: z.string().min(1).max(128),
  // The shape genuinely differs per entityType (loyalty fields vs. stock
  // levels vs. tender breakdown) — validated by each domain's own local
  // repository before it ever reaches this bridge, not re-validated here.
  payload: z.record(z.string(), z.unknown())
});

export const pushEntitySyncSchema = z.object({
  events: z.array(entitySyncEventSchema).min(1).max(200)
});

export type EntitySyncEventDto = z.infer<typeof entitySyncEventSchema>;
export type PushEntitySyncDto = z.infer<typeof pushEntitySyncSchema>;
