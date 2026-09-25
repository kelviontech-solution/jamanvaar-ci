/**
 * Development seed for cloud/api. Targets whatever database DATABASE_URL
 * points at (never live_db.json, never the local offline-runtime data) —
 * safe to run repeatedly against a scratch dev database.
 */
import { randomBytes, createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { shouldSeedDemoData } from '../src/config/seed-options';

const prisma = new PrismaClient();

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function main() {
  // Restaurant/Branch/User/Subscription are RLS-protected (see
  // src/prisma/prisma.service.ts) — a bare PrismaClient with no session
  // context set is correctly denied by Postgres, so seeding runs inside the
  // same platform-context transaction pattern the app itself uses.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);
    await seedInPlatformContext(tx);
  });
}

async function seedInPlatformContext(tx: Prisma.TransactionClient) {
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@jamanvaar.app';

  // Explicit, opt-in override for a known local/dev/CI password. Left unset,
  // a fresh super admin gets a random password printed once below (never
  // stored in a file, never hardcoded) — the secure default. This exists so
  // a developer or CI pipeline that wants a deterministic credential can
  // have one without a hardcoded password ever living in source (see the
  // now-removed auth bypass this replaced, platform-auth.service.ts SEC-011).
  const overridePassword = process.env.SEED_SUPER_ADMIN_PASSWORD || null;
  // Second, separate opt-in: overridePassword alone only affects a NEW
  // super admin. Rotating an EXISTING one's password requires this explicit
  // second flag too, so re-running seed against a real deployment can never
  // silently clobber a live credential just because the env still happens
  // to carry an old override value from someone's shell profile.
  const allowReset = process.env.SEED_RESET_SUPER_ADMIN_PASSWORD === 'true';

  let superAdminPassword: string | null = null;
  let superAdminWasReset = false;
  const existingSuperAdmin = await tx.platformUser.findUnique({ where: { email: superAdminEmail } });
  if (!existingSuperAdmin) {
    superAdminPassword = overridePassword || randomBytes(9).toString('base64url');
    await tx.platformUser.create({
      data: {
        email: superAdminEmail,
        passwordHash: await bcrypt.hash(superAdminPassword, 10),
        fullName: 'JAMANVAAR Super Admin',
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE'
      }
    });
  } else if (overridePassword && allowReset) {
    await tx.platformUser.update({
      where: { id: existingSuperAdmin.id },
      data: { passwordHash: await bcrypt.hash(overridePassword, 10) }
    });
    superAdminPassword = overridePassword;
    superAdminWasReset = true;
  }

  const coreEntitlements = {
    posTerminal: true,
    offlineBilling: true,
    dineInTakeawayDeliveryToken: true,
    menuManagement: true,
    foodCustomization: true,
    discountsAndGst: true,
    multiPaymentTenders: true,
    tableManagement: true,
    customerManagement: true,
    kotKdsRouting: true,
    receiptPrinting: true,
    shiftAndCashDrawer: true,
    salesAndGstReports: true,
    inventoryManagement: true,
    posAssistant: false,
    restaurantAdmin: true,
    captainApp: false,
    advancedCaptainReports: false,
    advancedServiceWorkflow: false,
    qrTableOrdering: false,
    selfOrderKiosk: false
  };

  const proEntitlements = {
    posTerminal: true,
    offlineBilling: true,
    dineInTakeawayDeliveryToken: true,
    menuManagement: true,
    foodCustomization: true,
    discountsAndGst: true,
    multiPaymentTenders: true,
    tableManagement: true,
    customerManagement: true,
    kotKdsRouting: true,
    receiptPrinting: true,
    shiftAndCashDrawer: true,
    salesAndGstReports: true,
    inventoryManagement: true,
    posAssistant: true,
    restaurantAdmin: true,
    captainApp: true,
    advancedCaptainReports: true,
    advancedServiceWorkflow: true,
    qrTableOrdering: true,
    selfOrderKiosk: true
  };

  // Phase 5: real annual pricing. priceMonthly is kept populated with the amortized
  // monthly-equivalent (priceYearly / 12) purely so existing MRR/ARR/upsell-price display code
  // that still reads priceMonthly keeps working unchanged — the real billed amount and period
  // for these plans is priceYearly/365 days (see InvoicesService.billingCycleFor).
  const corePlan = await tx.plan.upsert({
    where: { id: 'seed-plan-core' },
    update: {
      tier: 'CORE',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR CORE',
      description: 'Run the restaurant: POS, billing, KOT, menu, inventory, basic reports.',
      priceMonthly: 42000, // ₹420/mo amortized — not a real billing option
      priceYearly: 500000, // paise = ₹5,000/yr
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: coreEntitlements
    },
    create: {
      id: 'seed-plan-core',
      tier: 'CORE',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR CORE',
      description: 'Run the restaurant: POS, billing, KOT, menu, inventory, basic reports.',
      priceMonthly: 42000,
      priceYearly: 500000,
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: coreEntitlements
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-pro' },
    update: {
      tier: 'PRO',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR PRO',
      description: 'Everything in Core, plus KDS and the Captain wireless service workflow.',
      priceMonthly: 58000, // ₹580/mo amortized
      priceYearly: 700000, // paise = ₹7,000/yr
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: proEntitlements
    },
    create: {
      id: 'seed-plan-pro',
      tier: 'PRO',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR PRO',
      description: 'Everything in Core, plus KDS and the Captain wireless service workflow.',
      priceMonthly: 58000,
      priceYearly: 700000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: proEntitlements
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-qr' },
    update: {
      tier: 'QR',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR QR',
      description: 'Everything in Pro, plus QR table ordering for guest self-service.',
      priceMonthly: 75000, // ₹750/mo amortized
      priceYearly: 900000, // paise = ₹9,000/yr
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: { ...proEntitlements, qrTableOrdering: true }
    },
    create: {
      id: 'seed-plan-qr',
      tier: 'QR',
      productFamily: 'RESTAURANT',
      name: 'JAMANVAAR QR',
      description: 'Everything in Pro, plus QR table ordering for guest self-service.',
      priceMonthly: 75000,
      priceYearly: 900000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: { ...proEntitlements, qrTableOrdering: true }
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-kiosk-standard' },
    update: {
      tier: 'CORE',
      productFamily: 'KIOSK',
      name: 'KIOSK STANDARD',
      description: 'Self-ordering kiosk + Kiosk Admin: menu sync, cart, checkout, basic device management.',
      priceMonthly: 75000, // ₹750/mo amortized
      priceYearly: 900000, // paise = ₹9,000/yr
      maxBranches: 5,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    },
    create: {
      id: 'seed-plan-kiosk-standard',
      tier: 'CORE',
      productFamily: 'KIOSK',
      name: 'KIOSK STANDARD',
      description: 'Self-ordering kiosk + Kiosk Admin: menu sync, cart, checkout, basic device management.',
      priceMonthly: 75000,
      priceYearly: 900000,
      maxBranches: 5,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-kiosk-pro' },
    update: {
      tier: 'PRO',
      productFamily: 'KIOSK',
      name: 'KIOSK PRO',
      description: 'Everything in Kiosk Standard, plus multi-kiosk remote management and advanced analytics.',
      priceMonthly: 92000, // ₹920/mo amortized
      priceYearly: 1100000, // paise = ₹11,000/yr
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    },
    create: {
      id: 'seed-plan-kiosk-pro',
      tier: 'PRO',
      productFamily: 'KIOSK',
      name: 'KIOSK PRO',
      description: 'Everything in Kiosk Standard, plus multi-kiosk remote management and advanced analytics.',
      priceMonthly: 92000,
      priceYearly: 1100000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 10,
      entitlements: { selfOrderKiosk: true }
    }
  });

  await seedFeatureCatalog(tx);

  const demo = shouldSeedDemoData(process.env) ? await seedDemoTenant(tx, corePlan) : null;

  // Seed AppRelease Catalog for all 6 JAMANVAAR client applications
  // BUG-140 / BUG-141: every client app is built as 1.0.0 (package.json), so the seeded "current" release is
  // 1.0.0 with a minimum of 1.0.0 - a fresh database must not tell a terminal it is already out of date. The
  // seed used to invent later versions (2.4.0 ...) with a minimum above 1.0.0, which locked every terminal
  // behind a mandatory "Update required" wall, and download links pointing at files that do not exist (or at
  // another app's dev address). No download link is seeded: until real installers are published from the
  // Applications page, a terminal simply shows no download button.
  const appReleases = [
    { appCode: 'POS', supportedPlatforms: ['windows', 'web'], releaseNotes: 'Offline-first counter billing, fast token orders, multi-payment tenders, KOT routing, ESC/POS thermal printing.' },
    { appCode: 'RESTAURANT_ADMIN', supportedPlatforms: ['web', 'windows'], releaseNotes: 'Restaurant back-office portal, menu management, floor layouts, staff roles, statutory reports, cloud sync.' },
    { appCode: 'CAPTAIN', supportedPlatforms: ['android', 'web'], releaseNotes: 'Wireless table-side waiter ordering, instant course firing, kitchen ready alerts, tip tracking.' },
    { appCode: 'KDS', supportedPlatforms: ['web', 'android'], releaseNotes: 'Multi-station kitchen routing, cook time color alerts, bump bar support, course synchronization.' },
    { appCode: 'KIOSK', supportedPlatforms: ['windows', 'android'], releaseNotes: 'Self-ordering guest kiosk, dynamic combos, custom modifiers, UPI BharatQR display, auto-idle reset.' },
    { appCode: 'KIOSK_ADMIN', supportedPlatforms: ['web', 'windows'], releaseNotes: 'Kiosk terminal administration, station lock, screen branding, peripheral hardware configuration.' }
  ].map((r) => ({ ...r, version: '1.0.0', channel: 'STABLE' as const, minSupportedVersion: '1.0.0', downloadUrl: null as string | null }));

  // Databases seeded before this fix hold the invented releases; remove exactly those (and only those).
  const inventedReleases: Array<[string, string]> = [
    ['POS', '2.4.0'],
    ['RESTAURANT_ADMIN', '2.4.0'],
    ['CAPTAIN', '2.1.0'],
    ['KDS', '2.0.0'],
    ['KIOSK', '1.8.0'],
    ['KIOSK_ADMIN', '1.8.0']
  ];
  for (const [appCode, version] of inventedReleases) {
    await tx.appRelease.deleteMany({ where: { appCode, version } });
  }

  for (const rel of appReleases) {
    await tx.appRelease.upsert({
      where: { appCode_version: { appCode: rel.appCode, version: rel.version } },
      update: rel,
      create: rel
    });
  }

  // Seed default PlatformSettings
  const platformSettings = [
    {
      key: 'platform.branding',
      category: 'BRANDING',
      description: 'Platform name, company branding, and primary support contact',
      value: {
        platformName: 'JAMANVAAR SaaS Control Plane',
        companyName: 'Kelviontech',
        supportEmail: 'support@jamanvaar.app',
        supportPhone: '+91 98765 43210'
      }
    },
    {
      key: 'platform.billing',
      category: 'BILLING',
      description: 'Seller details printed on invoices and receipts',
      value: {
        tradeName: 'JAMANVAAR SaaS Platform',
        legalName: 'KELVIONTECH PRIVATE LIMITED',
        address: 'Plot 42, Science City Road, Sola',
        city: 'Ahmedabad',
        state: 'Gujarat',
        country: 'India',
        pincode: '380060',
        gstin: '24AAACK7890F1ZT',
        sacCode: '997331',
        sacDescription: 'Cloud SaaS Platform Subscription & Technical Support',
        bankName: 'HDFC Bank Ltd',
        bankAccountName: 'KELVIONTECH PRIVATE LIMITED',
        bankAccountNumber: '50200088991122',
        bankIfsc: 'HDFC0001234',
        upiId: 'jamanvaar@hdfcbank',
        billingEmail: ''
      }
    },
    {
      key: 'platform.defaults',
      category: 'DEFAULTS',
      description: 'Default trial period and device quotas for new onboardings',
      value: {
        trialDurationDays: 14,
        maxTrialBranches: 1,
        maxTrialDevices: 5,
        defaultCurrency: 'INR'
      }
    },
    {
      key: 'platform.maintenance',
      category: 'SYSTEM',
      description: 'Global maintenance mode and operational status banner',
      value: {
        maintenanceMode: false,
        scheduledDowntime: null,
        statusBanner: ''
      }
    }
  ];

  for (const s of platformSettings) {
    await tx.platformSetting.upsert({
      where: { key: s.key },
      // Never overwrite a value an admin already configured (maintenance banner, branding, trial defaults).
      update: { category: s.category, description: s.description },
      create: s
    });
  }


  console.log('--- Seed complete ---');
  console.log(`Plans: ${corePlan.name} + JAMANVAAR PRO + JAMANVAAR QR + KIOSK STANDARD + KIOSK PRO`);
  console.log(demo ? `Demo restaurant: ${demo.demoRestaurant.name} (${demo.demoRestaurant.id})` : 'Demo restaurant: not created (production, or SEED_DEMO_DATA=false)');
  if (superAdminWasReset) {
    console.log('');
    console.log('Super Admin password RESET via SEED_RESET_SUPER_ADMIN_PASSWORD — save it now, it is not stored or shown again:');
    console.log(`  email:    ${superAdminEmail}`);
    console.log(`  password: ${superAdminPassword}`);
  } else if (superAdminPassword) {
    console.log('');
    console.log('Super Admin created — save this password now, it is not stored or shown again:');
    console.log(`  email:    ${superAdminEmail}`);
    console.log(`  password: ${superAdminPassword}`);
  } else {
    console.log(`Super Admin already exists: ${superAdminEmail} (password unchanged — set SEED_SUPER_ADMIN_PASSWORD and SEED_RESET_SUPER_ADMIN_PASSWORD=true to rotate it)`);
  }
  if (demo) {
    const { demoRestaurant, demoOwnerPassword, demoOwnerActivationToken, demoOwnerActivatedNow } = demo;
    if (demoOwnerActivatedNow && demoOwnerPassword) {
      console.log('');
      console.log('Demo restaurant owner ACTIVE via SEED_DEMO_OWNER_PASSWORD — save this password now, it is not stored or shown again:');
      console.log(`  restaurantId: ${demoRestaurant.id}`);
      console.log(`  email:        owner@demo.jamanvaar.app`);
      console.log(`  password:     ${demoOwnerPassword}`);
      console.log('  This is the account POS Admin / Captain / POS device-connect screens should log in with.');
    } else if (demoOwnerActivationToken) {
      console.log('');
      console.log('Demo restaurant owner invitation — save this token now, it is not stored or shown again:');
      console.log(`  restaurantId: ${demoRestaurant.id}`);
      console.log(`  email:        owner@demo.jamanvaar.app`);
      console.log(`  token:        ${demoOwnerActivationToken}`);
      console.log('  Redeem it via POST /api/v1/tenant-auth/set-initial-password, or re-run this seed with');
      console.log('  SEED_DEMO_OWNER_PASSWORD=<password> set to activate the account directly.');
    } else {
      console.log(`Demo restaurant owner already exists: owner@demo.jamanvaar.app (status unchanged — set SEED_DEMO_OWNER_PASSWORD and SEED_RESET_DEMO_OWNER_PASSWORD=true to activate/rotate it)`);
    }
  }
}

/**
 * Phase 10 (gap closure): seeds the real, queryable Feature/FeatureCategory catalog from the
 * union of the 21 pre-existing Plan.entitlements keys and the 7 AppCode values, so both existing
 * entitlement systems keep working unchanged while this table becomes the source of truth for
 * describing them going forward. upsert-by-code throughout, so re-running this seed is always
 * safe (matches this project's established idempotent-backfill pattern).
 */
async function seedFeatureCatalog(tx: Prisma.TransactionClient) {
  const categories: Array<{ code: string; name: string; description: string; sortOrder: number }> = [
    { code: 'pos_billing', name: 'POS & Fast Billing', description: 'Fast counter billing, dine-in/takeaway/delivery/token order creation, discounts and automated tax calculation.', sortOrder: 1 },
    { code: 'payments_cash', name: 'Payments & Cash Drawer', description: 'Cash, UPI/BharatQR, card and split payments, cashier shifts, cash float and variance tracking.', sortOrder: 2 },
    { code: 'table_floor', name: 'Table & Floor Management', description: 'Visual floor plan, multi-zone dining, table occupancy status, table merge, split and transfer.', sortOrder: 3 },
    { code: 'kitchen_kot', name: 'Kitchen, KOT & KDS', description: 'KOT generation, kitchen timers, multi-station kitchen routing, preparing/ready tracking and station load balancing.', sortOrder: 4 },
    { code: 'menu_inventory', name: 'Menu & Inventory Management', description: 'Categorized menu, item modifiers, recipe costing, dish availability toggles, stock adjustments and low stock alerts.', sortOrder: 5 },
    { code: 'reports_gst', name: 'Reports & GST', description: 'Statutory GST reporting (CGST/SGST), daily sales summaries and discount reporting.', sortOrder: 6 },
    { code: 'offline_ops', name: 'Offline-First Operations', description: 'Local SQLite database, offline billing and order creation, automatic sync when back online.', sortOrder: 7 },
    { code: 'printing_hw', name: 'Printing & Hardware', description: '58mm/80mm ESC/POS thermal receipt printing and print queue management.', sortOrder: 8 },
    { code: 'customer_mgmt', name: 'Customer Management', description: 'Customer database, order/visit history and loyalty points.', sortOrder: 9 },
    { code: 'restaurant_admin', name: 'Restaurant Administration', description: 'Restaurant settings, branch information, tax/bill/printer configuration, user and role management.', sortOrder: 10 },
    { code: 'captain', name: 'Wireless Captain / Waiter App', description: 'Table-side ordering, course dispatch, order status tracking and waiter performance.', sortOrder: 11 },
    { code: 'qr_ordering', name: 'QR Table Ordering', description: 'Table QR code, scan-to-order digital menu, customer cart and order submission direct to POS/kitchen.', sortOrder: 12 },
    { code: 'kiosk', name: 'Self-Order Kiosk', description: 'Customer-facing self-ordering kiosk terminal and its Kiosk Admin management console.', sortOrder: 13 },
    { code: 'sync', name: 'Real-Time Multi-Machine Mesh Sync', description: 'POS/Captain/KDS/Kiosk real-time order, table, menu and availability synchronization.', sortOrder: 14 },
    { code: 'ai', name: 'JAMANVAAR AI Restaurant Assistant', description: 'Natural-language restaurant queries answered from local, offline data.', sortOrder: 15 },
    { code: 'analytics', name: 'Advanced Analytics & CRM', description: 'Advanced sales analytics, channel performance, customer lifetime value and staff attribution.', sortOrder: 16 }
  ];

  const categoryIdByCode = new Map<string, string>();
  for (const c of categories) {
    const row = await tx.featureCategory.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder }
    });
    categoryIdByCode.set(c.code, row.id);
  }

  interface FeatureSeed {
    code: string;
    name: string;
    description: string;
    categoryCode: string;
    appCode?: 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK' | 'KIOSK_ADMIN' | 'QR_ORDERING';
    legacyEntitlementKey?: string;
  }

  const features: FeatureSeed[] = [
    { code: 'posTerminal', name: 'POS Terminal', description: 'Counter billing terminal — order creation, item search and bill generation.', categoryCode: 'pos_billing', appCode: 'POS', legacyEntitlementKey: 'posTerminal' },
    { code: 'dineInTakeawayDeliveryToken', name: 'Dine-In / Takeaway / Delivery / Token', description: 'Order-type selection at billing.', categoryCode: 'pos_billing', legacyEntitlementKey: 'dineInTakeawayDeliveryToken' },
    { code: 'multiPaymentTenders', name: 'Multi-Payment Tenders', description: 'Cash, UPI/BharatQR, card and split payments.', categoryCode: 'payments_cash', legacyEntitlementKey: 'multiPaymentTenders' },
    { code: 'shiftAndCashDrawer', name: 'Shift & Cash Drawer', description: 'Cashier shift tracking, opening/closing cash and variance.', categoryCode: 'payments_cash', legacyEntitlementKey: 'shiftAndCashDrawer' },
    { code: 'tableManagement', name: 'Table Management', description: 'Visual floor plan and table occupancy tracking.', categoryCode: 'table_floor', legacyEntitlementKey: 'tableManagement' },
    { code: 'kotKdsRouting', name: 'KOT / KDS Routing', description: 'Kitchen order ticket generation and kitchen display routing.', categoryCode: 'kitchen_kot', appCode: 'KDS', legacyEntitlementKey: 'kotKdsRouting' },
    { code: 'menuManagement', name: 'Menu Management', description: 'Category and dish management.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'menuManagement' },
    { code: 'foodCustomization', name: 'Food Customization', description: 'Item modifiers and customization options.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'foodCustomization' },
    { code: 'inventoryManagement', name: 'Inventory Management', description: 'Stock tracking and dish availability toggles.', categoryCode: 'menu_inventory', legacyEntitlementKey: 'inventoryManagement' },
    { code: 'salesAndGstReports', name: 'Sales & GST Reports', description: 'Daily sales and statutory GST reporting.', categoryCode: 'reports_gst', legacyEntitlementKey: 'salesAndGstReports' },
    { code: 'discountsAndGst', name: 'Discounts & GST', description: 'Discount application and automated GST calculation.', categoryCode: 'reports_gst', legacyEntitlementKey: 'discountsAndGst' },
    { code: 'offlineBilling', name: 'Offline Billing', description: 'Local-first billing that works with no internet connection.', categoryCode: 'offline_ops', legacyEntitlementKey: 'offlineBilling' },
    { code: 'receiptPrinting', name: 'Receipt Printing', description: 'Thermal receipt and KOT printing.', categoryCode: 'printing_hw', legacyEntitlementKey: 'receiptPrinting' },
    { code: 'customerManagement', name: 'Customer Management', description: 'Customer database and order history.', categoryCode: 'customer_mgmt', legacyEntitlementKey: 'customerManagement' },
    { code: 'restaurantAdmin', name: 'Restaurant Admin', description: 'Back-office console for managing menu, staff and settings.', categoryCode: 'restaurant_admin', appCode: 'POS_ADMIN', legacyEntitlementKey: 'restaurantAdmin' },
    { code: 'captainApp', name: 'Captain App', description: 'Waiter-facing tableside ordering app.', categoryCode: 'captain', appCode: 'CAPTAIN', legacyEntitlementKey: 'captainApp' },
    { code: 'qrTableOrdering', name: 'QR Table Ordering', description: "Guest self-ordering from a table's QR code.", categoryCode: 'qr_ordering', appCode: 'QR_ORDERING', legacyEntitlementKey: 'qrTableOrdering' },
    { code: 'selfOrderKiosk', name: 'Self-Order Kiosk', description: 'Self-service ordering kiosk terminal.', categoryCode: 'kiosk', appCode: 'KIOSK', legacyEntitlementKey: 'selfOrderKiosk' },
    { code: 'KIOSK_ADMIN', name: 'Kiosk Admin', description: 'Back-office console for managing kiosk menu and settings.', categoryCode: 'kiosk', appCode: 'KIOSK_ADMIN' },
    { code: 'advancedServiceWorkflow', name: 'Real-Time Multi-Machine Mesh Sync', description: 'POS/Captain/KDS/Kiosk real-time order and table synchronization.', categoryCode: 'sync', legacyEntitlementKey: 'advancedServiceWorkflow' },
    { code: 'posAssistant', name: 'JAMAN AI Assistant', description: 'Offline, local-data-based natural-language restaurant queries.', categoryCode: 'ai', legacyEntitlementKey: 'posAssistant' },
    { code: 'advancedCaptainReports', name: 'Advanced Analytics & CRM', description: 'Advanced sales analytics, channel performance and staff attribution.', categoryCode: 'analytics', legacyEntitlementKey: 'advancedCaptainReports' }
  ];

  const featureIdByCode = new Map<string, string>();
  for (const f of features) {
    const row = await tx.feature.upsert({
      where: { code: f.code },
      create: {
        code: f.code,
        name: f.name,
        description: f.description,
        categoryId: categoryIdByCode.get(f.categoryCode)!,
        appCode: f.appCode ?? null,
        legacyEntitlementKey: f.legacyEntitlementKey ?? null
      },
      update: { name: f.name, description: f.description, categoryId: categoryIdByCode.get(f.categoryCode)! }
    });
    featureIdByCode.set(f.code, row.id);
  }

  // KIOSK_ADMIN depends on selfOrderKiosk (the KIOSK app) — set once both rows exist.
  await tx.feature.update({
    where: { code: 'KIOSK_ADMIN' },
    data: { dependsOnFeatureIds: [featureIdByCode.get('selfOrderKiosk')!] }
  });
  // POS_ADMIN (restaurantAdmin) depends on POS (posTerminal).
  await tx.feature.update({
    where: { code: 'restaurantAdmin' },
    data: { dependsOnFeatureIds: [featureIdByCode.get('posTerminal')!] }
  });
}

/**
 * The sample tenant used for local development and CI (BUG-018): a demo restaurant, branch, owner,
 * subscription and invoice. Never created in production unless SEED_DEMO_DATA=true (see src/config/seed-options.ts).
 */
async function seedDemoTenant(tx: Prisma.TransactionClient, corePlan: { id: string }) {
  // RLS's runAsTenant() (see prisma.service.ts) requires ids to match the
  // canonical UUID shape restaurant.id normally gets from @default(uuid()) —
  // a human-readable slug here breaks every tenant-scoped query for this row.
  const DEMO_RESTAURANT_ID = '11111111-1111-4111-8111-111111111111';
  const demoRestaurant = await tx.restaurant.upsert({
    where: { id: DEMO_RESTAURANT_ID },
    update: {},
    create: {
      id: DEMO_RESTAURANT_ID,
      name: 'JAMANVAAR — Demo Restaurant',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India'
    }
  });

  const demoBranch = await tx.branch.upsert({
    where: { restaurantId_code: { restaurantId: demoRestaurant.id, code: 'MAIN' } },
    update: {},
    create: {
      restaurantId: demoRestaurant.id,
      name: 'Demo Restaurant — Main Branch',
      code: 'MAIN'
    }
  });

  // Same opt-in shape as the super admin above: unset, a fresh owner is
  // invited the normal way (a one-time activation token, printed once,
  // redeemed through POST /tenant-auth/set-initial-password like any real
  // invitee). Set SEED_DEMO_OWNER_PASSWORD to also skip straight to an
  // ACTIVE account with that password — useful for local dev/CI/Captain and
  // POS Admin testing, where waiting on the invitation dance for a demo
  // account buys nothing. Never applied to a real invited user, only to
  // this seed-created demo owner.
  const demoOwnerPassword = process.env.SEED_DEMO_OWNER_PASSWORD || null;
  const allowDemoOwnerReset = process.env.SEED_RESET_DEMO_OWNER_PASSWORD === 'true';

  let demoOwnerActivationToken: string | null = null;
  let demoOwnerActivatedNow = false;
  const existingDemoOwner = await tx.user.findUnique({
    where: { restaurantId_email: { restaurantId: demoRestaurant.id, email: 'owner@demo.jamanvaar.app' } }
  });
  if (!existingDemoOwner) {
    if (demoOwnerPassword) {
      await tx.user.create({
        data: {
          restaurantId: demoRestaurant.id,
          branchId: demoBranch.id,
          email: 'owner@demo.jamanvaar.app',
          fullName: 'Demo Owner',
          role: 'OWNER',
          status: 'ACTIVE',
          invitedAt: new Date(),
          activatedAt: new Date(),
          passwordHash: await bcrypt.hash(demoOwnerPassword, 10)
        }
      });
      demoOwnerActivatedNow = true;
    } else {
      demoOwnerActivationToken = randomBytes(32).toString('base64url');
      await tx.user.create({
        data: {
          restaurantId: demoRestaurant.id,
          branchId: demoBranch.id,
          email: 'owner@demo.jamanvaar.app',
          fullName: 'Demo Owner',
          role: 'OWNER',
          status: 'PENDING_ACTIVATION',
          invitedAt: new Date(),
          activationTokenHash: hashOpaqueToken(demoOwnerActivationToken),
          activationTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
    }
  } else if (demoOwnerPassword && (existingDemoOwner.status === 'PENDING_ACTIVATION' || allowDemoOwnerReset)) {
    // A still-pending invite is always safe to fast-track this way (nobody
    // has a working password for it yet). An already-ACTIVE owner is only
    // touched with the explicit second flag, same double opt-in as the
    // super admin reset above.
    await tx.user.update({
      where: { id: existingDemoOwner.id },
      data: {
        status: 'ACTIVE',
        activatedAt: existingDemoOwner.activatedAt ?? new Date(),
        activationTokenHash: null,
        activationTokenExpiresAt: null,
        passwordHash: await bcrypt.hash(demoOwnerPassword, 10)
      }
    });
    demoOwnerActivatedNow = true;
  }

  const existingSubscription = await tx.subscription.findFirst({
    where: { restaurantId: demoRestaurant.id }
  });
  let subId = existingSubscription?.id;
  if (!existingSubscription) {
    const newSub = await tx.subscription.create({
      data: {
        restaurantId: demoRestaurant.id,
        planId: corePlan.id,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        trialEndsAt: null
      }
    });
    subId = newSub.id;
  }

  // The demo restaurant is meant to showcase/exercise every client app
  // (POS, POS Admin, Captain, KDS, Kiosk, Kiosk Admin) for local dev/CI —
  // but it's seeded on the CORE plan, whose tier defaults
  // (DEFAULT_APPS_BY_TIER in application-entitlements.service.ts) don't
  // include Captain/Kiosk/Kiosk Admin. Without this, a fresh Kiosk Admin
  // terminal's activation step fails ApplicationEntitlementsService's
  // assertAppEnabled check even after a correct login. Explicitly enable
  // all six apps for this one demo subscription only — real restaurants
  // still get the tier-gated defaults everywhere else.
  if (subId) {
    const allAppCodes = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'] as const;
    await Promise.all(
      allAppCodes.map((appCode) =>
        tx.applicationEntitlement.upsert({
          where: { subscriptionId_appCode: { subscriptionId: subId!, appCode } },
          create: { restaurantId: demoRestaurant.id, subscriptionId: subId!, appCode, enabled: true },
          update: { enabled: true }
        })
      )
    );
  }

  // Seed initial demo Invoice
  const existingInvoice = await tx.invoice.findFirst({
    where: { restaurantId: demoRestaurant.id }
  });
  if (!existingInvoice && subId) {
    const now = new Date();
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: 'INV-2026-0001',
        restaurantId: demoRestaurant.id,
        subscriptionId: subId,
        planId: corePlan.id,
        amount: 500000, // ₹5,000 in paise
        taxAmount: 90000, // ₹900 GST 18% in paise
        totalAmount: 590000, // ₹5,900 in paise
        status: 'PAID',
        billingPeriodStart: now,
        billingPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        dueDate: now,
        paidAt: now,
        notes: 'Initial monthly subscription fee'
      }
    });

    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        restaurantId: demoRestaurant.id,
        amount: 590000,
        method: 'UPI',
        referenceNumber: 'UPI-REF-992817421',
        status: 'COMPLETED',
        notes: 'Direct UPI payment'
      }
    });
  }

  return { demoRestaurant, demoOwnerPassword, demoOwnerActivationToken, demoOwnerActivatedNow };
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
