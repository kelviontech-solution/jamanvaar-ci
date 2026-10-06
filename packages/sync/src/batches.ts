/** Leave space for the JSON envelope below the API's request-body limit. */
export function jsonBatches<T>(records: T[], maxItems: number, maxBytes: number): T[][] {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let batch: T[] = [];
  let bytes = 32;
  for (const record of records) {
    const size = encoder.encode(JSON.stringify(record)).byteLength + 1;
    if (batch.length && (batch.length >= maxItems || bytes + size > maxBytes)) {
      batches.push(batch); batch = []; bytes = 32;
    }
    batch.push(record); bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
