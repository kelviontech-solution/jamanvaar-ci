/**
 * GSTIN/FSSAI validation (BUG-054). `gstin`/`fssaiNumber` used to be accepted as any
 * trimmed string with no format check — restaurants ended up with "GSTIN: VVSD" printed
 * on real tax invoices. Both stay optional (an unregistered restaurant has neither), but
 * a value that is given must be well-formed.
 */

// GST state/UT codes, the first two digits of every GSTIN.
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  'andhra pradesh (old)': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38'
};

// 2 digits state code, 10-char PAN, 1-digit entity code, 'Z' by default, 1-char checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const FSSAI_RE = /^[0-9]{14}$/;

export function isValidGstinFormat(value: string): boolean {
  return GSTIN_RE.test(value);
}

export function isValidFssaiFormat(value: string): boolean {
  return FSSAI_RE.test(value);
}

/**
 * True unless the GSTIN's state-code prefix demonstrably contradicts a *recognised*
 * declared state. An unrecognised state name (typo, different spelling) or no state at
 * all cannot be used to reject the GSTIN — only a real mismatch can.
 */
export function gstinStateCodeMatches(gstin: string, state: string | undefined | null): boolean {
  if (!state) return true;
  const expected = GST_STATE_CODES[state.trim().toLowerCase()];
  if (!expected) return true;
  return gstin.slice(0, 2) === expected;
}
