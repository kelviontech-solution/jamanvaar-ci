// security-audit LOW-01: Excel/Sheets/LibreOffice treat a leading =, +, -, @,
// tab or CR as the start of a formula. Any value that reaches a CSV export
// unescaped — a customer name, restaurant name, item name — is an injection
// vector into whoever opens the file (DDE/command execution in older Excel,
// data exfiltration via a formula that calls out to a URL in newer versions).
const CSV_FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Render a single CSV cell, quoted and escaped, with a leading apostrophe
 * guard against formula injection for values Excel would otherwise treat
 * as a formula.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const guarded = CSV_FORMULA_TRIGGER_CHARS.some((c) => str.startsWith(c)) ? `'${str}` : str;
  return `"${guarded.replace(/"/g, '""')}"`;
}
