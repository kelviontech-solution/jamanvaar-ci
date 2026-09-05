import { describe, it, expect } from 'vitest';
import {
  db,
  posDb,
  posAdminDb,
  captainDb,
  kdsDb,
  JamanvaarLocalCore
} from '../packages/database/src';

describe('Unified Local Core Architecture: Single Authoritative Database Client Unification', () => {
  it('should ensure all restaurant applications connect to the same Local Core database', () => {
    expect(posDb).toBeDefined();
    expect(posAdminDb).toBeDefined();
    expect(captainDb).toBeDefined();
    expect(kdsDb).toBeDefined();

    // Verify all restaurant client variables point to the same authoritative db instance
    expect(posDb).toBe(db);
    expect(posAdminDb).toBe(db);
    expect(captainDb).toBe(db);
    expect(kdsDb).toBe(db);
  });

  it('should ensure local mutations in one role immediately reflect across all interfaces on same machine', () => {
    posDb.restaurant.name = 'JAMANVAAR — The Royal Gujarati Dining';
    expect(posAdminDb.restaurant.name).toBe('JAMANVAAR — The Royal Gujarati Dining');
    expect(captainDb.restaurant.name).toBe('JAMANVAAR — The Royal Gujarati Dining');
    expect(kdsDb.restaurant.name).toBe('JAMANVAAR — The Royal Gujarati Dining');
  });

  it('should expose Local Core health and device fleet authority', () => {
    const health = JamanvaarLocalCore.getHealth();
    expect(health.restaurant_id).toBe('JAMANVAAR-AHM-FLAGSHIP');
    expect(health.outlet_id).toBe('AHM-FLAGSHIP');
    expect(health.core_status).toBe('HEALTHY');
  });
});
