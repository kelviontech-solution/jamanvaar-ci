import { describe, it, expect } from 'vitest';
import { buildContent } from './menu-snapshot';

const row = (entityType: string, payload: Record<string, unknown>) => ({ entityType, payload });
const dish = (extra: Record<string, unknown> = {}) => row('MENU_ITEM', { id: 'dish', name: 'Dish', price: 100, categoryId: 'cat', isAvailable: true, qrEnabled: true, ...extra });
const category = row('MENU_CATEGORY', { id: 'cat', name: 'Mains', isActive: true, qrVisible: true });
const gst5 = (extra: Record<string, unknown> = {}) => row('TAX_GROUP', { id: 'gst5', name: 'GST 5%', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: true, isActive: true, ...extra });
const gst18 = (extra: Record<string, unknown> = {}) => row('TAX_GROUP', { id: 'gst18', name: 'GST 18%', cgstPercent: 9, sgstPercent: 9, igstPercent: 18, isInclusive: false, isActive: true, ...extra });

describe('menu snapshot tax: a dish with no usable tax group takes the default group', () => {
  it('a dish with no tax group is published with the flagged default group', () => {
    const result = buildContent([category, gst5({ isDefault: true }), dish()]);
    const item = result.content.items.find((i) => i.id === 'dish');
    expect(item?.taxGroupId).toBe('gst5');
    expect(result.content.taxGroups.gst5).toEqual({ rateBp: 500, inclusive: true });
  });

  it('a dish whose tax group is not published falls back to the default instead of being hidden', () => {
    const result = buildContent([category, gst5({ isDefault: true }), dish({ taxGroupId: 'deleted-group' })]);
    expect(result.content.items.find((i) => i.id === 'dish')?.taxGroupId).toBe('gst5');
    expect(result.warnings.some((w) => w.includes('not published'))).toBe(false);
  });

  it('a dish with its own published group keeps it', () => {
    const result = buildContent([category, gst5({ isDefault: true }), gst18(), dish({ taxGroupId: 'gst18' })]);
    expect(result.content.items.find((i) => i.id === 'dish')?.taxGroupId).toBe('gst18');
  });

  it('with several groups and none flagged, a dish with no group stays untaxed as before', () => {
    const result = buildContent([category, gst5(), gst18(), dish()]);
    expect(result.content.items.find((i) => i.id === 'dish')?.taxGroupId).toBeUndefined();
  });

  it('a single active group is the default when none is flagged', () => {
    const result = buildContent([category, gst5(), dish()]);
    expect(result.content.items.find((i) => i.id === 'dish')?.taxGroupId).toBe('gst5');
  });

  it('an inactive default is ignored', () => {
    const result = buildContent([category, gst5({ isDefault: true, isActive: false }), dish()]);
    expect(result.content.items.find((i) => i.id === 'dish')?.taxGroupId).toBeUndefined();
  });
});
