import { describe, expect, it } from 'vitest';
import { shouldSeedDemoData } from './seed-options';

/** BUG-018: the seed used to create a "Demo Restaurant" and demo owner in whatever database it was pointed at, production included. */
describe('shouldSeedDemoData', () => {
  it('is on for development and test by default', () => {
    expect(shouldSeedDemoData({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldSeedDemoData({ NODE_ENV: 'test' })).toBe(true);
    expect(shouldSeedDemoData({})).toBe(true);
  });

  it('is off in production unless explicitly asked for', () => {
    expect(shouldSeedDemoData({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldSeedDemoData({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' })).toBe(true);
  });

  it('can be switched off anywhere', () => {
    expect(shouldSeedDemoData({ NODE_ENV: 'development', SEED_DEMO_DATA: 'false' })).toBe(false);
    expect(shouldSeedDemoData({ SEED_DEMO_DATA: 'FALSE' })).toBe(false);
  });

  it('ignores anything that is not clearly true or false', () => {
    expect(shouldSeedDemoData({ NODE_ENV: 'production', SEED_DEMO_DATA: 'yes' })).toBe(false);
    expect(shouldSeedDemoData({ NODE_ENV: 'development', SEED_DEMO_DATA: 'maybe' })).toBe(true);
  });
});
