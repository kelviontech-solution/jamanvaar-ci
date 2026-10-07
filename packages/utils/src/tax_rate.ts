import type { TaxGroup } from '@jamanvaar/types';

/**
 * The tax the restaurant charges on dishes that have no tax group of their own: the active group flagged isDefault,
 * or the only active group when none is flagged. Undefined means those dishes are untaxed.
 */
export function resolveDefaultTaxGroup(groups: TaxGroup[]): TaxGroup | undefined {
  const active = groups.filter((g) => g.isActive);
  return active.find((g) => g.isDefault) ?? (active.length === 1 ? active[0] : undefined);
}

/** The restaurant's configured GST, as set in Customisations & Tax. Every label on a bill or report is built from this. */
export interface GstRate {
  name: string;
  cgstPercent: number;
  sgstPercent: number;
  totalPercent: number;
}

export function restaurantGstRate(groups: TaxGroup[]): GstRate | undefined {
  const group = resolveDefaultTaxGroup(groups);
  if (!group) return undefined;
  const cgstPercent = group.cgstPercent ?? 0;
  const sgstPercent = group.sgstPercent ?? 0;
  return { name: group.name, cgstPercent, sgstPercent, totalPercent: group.igstPercent || cgstPercent + sgstPercent };
}

/** 5 → "5", 2.5 → "2.5": a percentage as a person would write it. */
export function formatTaxPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export interface TaxLabels {
  /** "GST (5%)" */
  total: string;
  /** "CGST (2.5%)" */
  cgst: string;
  /** "SGST (2.5%)" */
  sgst: string;
  /** "GST 5% (2.5% CGST + 2.5% SGST)" */
  combined: string;
}

/** Column and line labels for a restaurant's tax. With no tax configured they stay generic rather than naming a rate. */
export function taxLabels(rate: GstRate | undefined): TaxLabels {
  if (!rate) return { total: 'Tax', cgst: 'CGST', sgst: 'SGST', combined: 'Tax' };
  const total = formatTaxPercent(rate.totalPercent);
  const cgst = formatTaxPercent(rate.cgstPercent);
  const sgst = formatTaxPercent(rate.sgstPercent);
  return {
    total: `GST (${total}%)`,
    cgst: `CGST (${cgst}%)`,
    sgst: `SGST (${sgst}%)`,
    combined: `GST ${total}% (${cgst}% CGST + ${sgst}% SGST)`
  };
}
