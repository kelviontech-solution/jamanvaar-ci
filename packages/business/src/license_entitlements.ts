import { db, LicenseRepository } from '@jamanvaar/database';
import { PlanTier, PlanEntitlements, LicenseInfo } from '@jamanvaar/types';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  price: number;
  badge?: string;
  tagline: string;
  description: string;
  features: Array<{ name: string; included: boolean; note?: string }>;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  CORE: {
    tier: 'CORE',
    name: 'JAMANVAAR CORE',
    price: 5000,
    tagline: 'POS + Restaurant Management',
    description: 'Complete offline-first counter billing, KOT, tables, payments, inventory, and restaurant admin.',
    features: [
      { name: 'Counter POS & Fast Billing', included: true },
      { name: '100% Offline-First SQLite Local DB', included: true },
      { name: 'Dine-In, Takeaway, Delivery, Token Orders', included: true },
      { name: 'Menu & Category Management + Customizations', included: true },
      { name: 'Multi-Payment: Cash, UPI BharatQR, Card, Split', included: true },
      { name: 'Table Management & Real-Time Floor Plan', included: true },
      { name: 'Customer Database & Loyalty Points', included: true },
      { name: 'Kitchen KOT & Multi-Station Routing', included: true },
      { name: '58mm & 80mm ESC/POS Thermal Receipt Printing', included: true },
      { name: 'Cash Drawer Kick & Cashier Shift Float', included: true },
      { name: 'Daily Sales & Statutory 5% GST Reports', included: true },
      { name: 'Inventory & 86 Dish Availability', included: true },
      { name: 'JAMAN AI Local Assistant & Intelligence', included: true },
      { name: 'Restaurant Admin Management Portal', included: true },
      { name: 'Captain App (Table-Side Ordering)', included: false, note: 'Available in PRO' },
      { name: 'Waiter & Captain Performance Analytics', included: false, note: 'Available in PRO' },
      { name: 'Captain ↔ KDS Real-Time Course Sync', included: false, note: 'Available in PRO' }
    ]
  },
  PRO: {
    tier: 'PRO',
    name: 'JAMANVAAR PRO',
    price: 7000,
    badge: 'RECOMMENDED',
    tagline: 'POS + Restaurant Management + Captain App',
    description: 'All Core features plus full wireless Captain App table-side ordering, course dispatch, and waiter tracking.',
    features: [
      { name: 'Everything in JAMANVAAR CORE', included: true },
      { name: 'Wireless Captain App for Waiters', included: true },
      { name: 'Table-Side Ordering & Course Dispatch', included: true },
      { name: 'Instant Food Ready & KDS Notifications', included: true },
      { name: 'Waiter Performance & Tip Allocation', included: true },
      { name: 'Captain ↔ POS ↔ KDS Real-Time Mesh Sync', included: true },
      { name: 'Advanced Operational Analytics & Flow Metrics', included: true }
    ]
  }
};

export class EntitlementService {
  public static getActiveLicense(): LicenseInfo {
    return LicenseRepository.getLicense();
  }

  public static isFeatureEnabled(feature: keyof PlanEntitlements): boolean {
    const license = LicenseRepository.getLicense();
    return Boolean(license?.entitlements?.[feature]);
  }

  public static checkCaptainAppAccess(): {
    allowed: boolean;
    tier: PlanTier;
    message?: string;
  } {
    const license = LicenseRepository.getLicense();
    const isPro = license?.tier === 'PRO' && Boolean(license?.entitlements?.captainApp);

    if (!isPro) {
      return {
        allowed: false,
        tier: license?.tier || 'CORE',
        message: 'Captain App is available in JAMANVAAR PRO (₹7,000). Upgrade your license to enable waiter table-side ordering.'
      };
    }

    return {
      allowed: true,
      tier: 'PRO'
    };
  }

  public static activatePlan(tier: PlanTier, key?: string): LicenseInfo {
    return LicenseRepository.activatePlan(tier, key);
  }
}
