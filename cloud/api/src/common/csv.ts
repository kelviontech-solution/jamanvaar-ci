/**
 * B2-061: shared CSV cell sanitizer for the platform's own server-generated CSV exports
 * (ReportsService.generateCsv). Mirrors packages/utils/src/csv.ts's logic exactly — duplicated
 * here rather than adding a new cross-workspace dependency to this NestJS service for one small
 * utility, matching the precedent already set for cloud/super-admin-web's own local copy.
 *
 * Restaurant/plan names are free text set by whoever created the restaurant/plan and were
 * written into these CSVs with only an internal-quote escape, no defense against CSV/formula
 * injection (CWE-1236) — a value starting with `=`, `+`, `-` or `@` is evaluated as a formula
 * the moment the file is opened in Excel/Sheets.
 */

const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

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

export function toCsvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map(sanitizeCsvCell).join(',');
}

export function toCsv(header: Array<string | number>, rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return [toCsvRow(header), ...rows.map(toCsvRow)].join('\r\n');
}
