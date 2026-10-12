export interface RefundJournalEvent {idempotencyKey:string;amountPaise:number;method:'CASH'|'UPI_TO_CUSTOMER';originalShiftId?:string;payingShiftId?:string;businessDayId:string;at:string;actor:string;reason:string}
/** Append-only evidence: a reconnect cannot erase or rewrite a previous return. */
export function validateRefundJournal(incoming: RefundJournalEvent[], previous: RefundJournalEvent[], refundAmount: number, total: number) {
  const keys = new Set<string>(); let sum = 0;
  for (const row of incoming) {
    if (!row.payingShiftId || !row.businessDayId || keys.has(row.idempotencyKey) || !Number.isSafeInteger(row.amountPaise) || row.amountPaise <= 0) throw new Error('Invalid return journal');
    keys.add(row.idempotencyKey); sum += row.amountPaise;
  }
  if (sum > refundAmount || refundAmount > total) throw new Error('Return journal exceeds the recorded collection');
  for (const row of previous) {
    const next = incoming.find(value => value.idempotencyKey === row.idempotencyKey);
    const fields = ['idempotencyKey','amountPaise','method','originalShiftId','payingShiftId','businessDayId','at','reason'] as const;
    if (!next || fields.some(field => next[field] !== row[field])) throw new Error('Previous return events cannot be removed or changed');
  }
}
