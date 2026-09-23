// security-audit LOW-01: a leading =, +, -, @, tab or CR is read as a formula
// by Excel/Sheets/LibreOffice — guard it with a leading apostrophe so a
// tenant-controlled value (restaurant name, plan name) can't turn into a
// formula (and potential command/URL exfiltration) for whoever opens the export.
const CSV_FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const guarded = CSV_FORMULA_TRIGGER_CHARS.some((c) => str.startsWith(c)) ? `'${str}` : str;
  return `"${guarded.replace(/"/g, '""')}"`;
}
