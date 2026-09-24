export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

// B2-061: this escaped an internal quote but did nothing about CSV/formula injection
// (CWE-1236) — a cell starting with `=`, `+`, `-` or `@` is evaluated as a formula the moment
// the exported file is opened in Excel/Sheets. Every list page on this app (restaurants,
// owners, devices, billing, reports, audit logs, activation keys) funnels through this one
// function, so restaurant/owner names — free text a Super Admin enters when creating a
// restaurant — reach it unsanitized against that class of attack. Prefixing a leading
// formula-trigger character with `'` is the standard mitigation: the spreadsheet then renders
// the value as literal text instead of evaluating it.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function escapeCsvCell(value: string | number | null | undefined): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (str.length > 0 && FORMULA_TRIGGER_CHARS.has(str[0])) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a CSV file from in-memory rows and triggers a browser download.
 * Client-side by design — every list page that uses this already has the
 * full dataset loaded for its table, so no extra backend endpoint is needed.
 */
export function exportRowsToCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','));
  const csv = [header, ...lines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
