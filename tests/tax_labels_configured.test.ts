import { describe, it, expect } from 'vitest';
import { restaurantGstRate, taxLabels, formatTaxPercent, resolveDefaultTaxGroup } from '@jamanvaar/utils';
import { SEED_TAX_GROUPS } from '@jamanvaar/database';
import type { TaxGroup } from '@jamanvaar/types';

const gst18: TaxGroup = { id: 'gst18', name: 'GST 18%', cgstPercent: 9, sgstPercent: 9, igstPercent: 18, isInclusive: false, isActive: true };

describe('every tax label on a bill or report comes from the restaurant’s configured GST', () => {
  it('the seeded 5% group reads as GST 5% with a 2.5% CGST and SGST split', () => {
    const labels = taxLabels(restaurantGstRate(SEED_TAX_GROUPS));
    expect(labels.total).toBe('GST (5%)');
    expect(labels.cgst).toBe('CGST (2.5%)');
    expect(labels.sgst).toBe('SGST (2.5%)');
    expect(labels.combined).toBe('GST 5% (2.5% CGST + 2.5% SGST)');
  });

  it('when the admin changes the rate, every label follows it', () => {
    const changed: TaxGroup[] = [{ ...gst18, isDefault: true }];
    const labels = taxLabels(restaurantGstRate(changed));
    expect(labels.total).toBe('GST (18%)');
    expect(labels.combined).toBe('GST 18% (9% CGST + 9% SGST)');
  });

  it('a fractional split is written as a person would write it', () => {
    const groups: TaxGroup[] = [{ id: 'g', name: 'GST 12.5%', cgstPercent: 6.25, sgstPercent: 6.25, igstPercent: 12.5, isInclusive: true, isActive: true, isDefault: true }];
    expect(taxLabels(restaurantGstRate(groups)).cgst).toBe('CGST (6.25%)');
    expect(formatTaxPercent(5)).toBe('5');
    expect(formatTaxPercent(2.5)).toBe('2.5');
  });

  it('with no tax configured the labels stay generic and name no rate', () => {
    const labels = taxLabels(restaurantGstRate([]));
    expect(labels).toEqual({ total: 'Tax', cgst: 'CGST', sgst: 'SGST', combined: 'Tax' });
  });

  it('an inactive default is not used for the labels', () => {
    expect(restaurantGstRate([{ ...gst18, isDefault: true, isActive: false }])).toBeUndefined();
  });

  it('the default group is the same rule the bill uses: the flagged active group, or the only active one', () => {
    expect(resolveDefaultTaxGroup([gst18, { ...SEED_TAX_GROUPS[0], isDefault: true }])?.id).toBe('tax-gst-5');
    expect(resolveDefaultTaxGroup([gst18, { ...SEED_TAX_GROUPS[0], isDefault: false }])).toBeUndefined();
  });
});
