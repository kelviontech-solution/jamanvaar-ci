export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

// security-audit LOW-01: a leading =, +, -, @, tab or CR is read as a formula
// by Excel/Sheets/LibreOffice — guard it with a leading apostrophe so a
// restaurant/plan/customer name chosen by an untrusted actor can't turn into
// a formula (and potential command/URL exfiltration) for whoever opens the export.
const CSV_FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const guarded = CSV_FORMULA_TRIGGER_CHARS.some((c) => str.startsWith(c)) ? `'${str}` : str;
  if (/[",\n]/.test(guarded) || guarded !== str) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
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
