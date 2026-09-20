import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DisplayScale, DeviceGate } from '@jamanvaar/sync';

/**
 * BUG-008: the POS opened at an unexplained 130%, hard-coded, and did not follow anything changed in Restaurant
 * Admin. The size is now: the restaurant's default from Restaurant Admin (delivered with the heartbeat), or, if the
 * person at this terminal picked their own size, that. 100% when nothing is set.
 */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

describe('terminal display size (BUG-008)', () => {
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
    DisplayScale.reset();
  });
  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  it('is 100% until someone sets it', () => {
    expect(DisplayScale.getEffective()).toBe(100);
    expect(DisplayScale.getLocalOverride()).toBeNull();
  });

  it("follows the restaurant's default from the heartbeat", () => {
    DeviceGate.applyHeartbeat({ ok: true, displayScalePercent: 120 });
    expect(DisplayScale.getCloudDefault()).toBe(120);
    expect(DisplayScale.getEffective()).toBe(120);
    DeviceGate.applyHeartbeat({ ok: true, displayScalePercent: 90 });
    expect(DisplayScale.getEffective()).toBe(90);
  });

  it('a size chosen on this terminal wins, until it is cleared', () => {
    DisplayScale.setCloudDefault(120);
    DisplayScale.setLocalOverride(85);
    expect(DisplayScale.getEffective()).toBe(85);
    DeviceGate.applyHeartbeat({ ok: true, displayScalePercent: 130 });
    expect(DisplayScale.getEffective()).toBe(85);
    DisplayScale.setLocalOverride(null);
    expect(DisplayScale.getEffective()).toBe(130);
  });

  it('survives a restart: both values come back from storage', () => {
    DisplayScale.setCloudDefault(110);
    DisplayScale.setLocalOverride(95);
    DisplayScale.reloadFromStorage();
    expect(DisplayScale.getCloudDefault()).toBe(110);
    expect(DisplayScale.getLocalOverride()).toBe(95);
  });

  it('ignores anything that is not a sensible size and clamps to the allowed range', () => {
    DisplayScale.setCloudDefault(120);
    for (const bad of [undefined, null, 'big', NaN, 0, -5]) DisplayScale.setCloudDefault(bad as never);
    expect(DisplayScale.getCloudDefault()).toBe(120);
    DisplayScale.setLocalOverride(500);
    expect(DisplayScale.getEffective()).toBe(150);
    DisplayScale.setLocalOverride(10);
    expect(DisplayScale.getEffective()).toBe(70);
  });

  it('is applied to the page as a zoom, and removed again at 100%', () => {
    const root = { style: { zoom: '' } };
    DisplayScale.setLocalOverride(125);
    DisplayScale.applyToDocument(root);
    expect(root.style.zoom).toBe('1.25');
    DisplayScale.setLocalOverride(null);
    DisplayScale.applyToDocument(root);
    expect(root.style.zoom).toBe('');
  });

  it('tells listeners when the effective size changes, and only then', () => {
    let calls = 0;
    const off = DisplayScale.subscribe(() => (calls += 1));
    DisplayScale.setCloudDefault(120);
    expect(calls).toBe(1);
    DisplayScale.setCloudDefault(120);
    expect(calls).toBe(1);
    DisplayScale.setLocalOverride(120);
    expect(calls).toBe(1);
    DisplayScale.setLocalOverride(100);
    expect(calls).toBe(2);
    off();
    DisplayScale.setLocalOverride(90);
    expect(calls).toBe(2);
  });
});
