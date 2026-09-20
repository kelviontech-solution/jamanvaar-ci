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

  const corePlan = await tx.plan.upsert({
    where: { id: 'seed-plan-core' },
    update: {
      tier: 'CORE',
      name: 'JAMANVAAR CORE',
      description: 'Foundation Edition: POS + Complete Restaurant Management (10 modules, 183 base features)',
      priceMonthly: 500000,
      priceYearly: 5000000,
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: coreEntitlements
    },
    create: {
      id: 'seed-plan-core',
      tier: 'CORE',
      name: 'JAMANVAAR CORE',
      description: 'Foundation Edition: POS + Complete Restaurant Management (10 modules, 183 base features)',
      priceMonthly: 500000, // paise = ₹5,000
      priceYearly: 5000000, // paise = ₹50,000
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
      name: 'JAMANVAAR PRO',
      description: 'Flagship Edition: Everything in Core + Wireless Captain, QR Table Ordering, Mesh Sync & AI (364 features total)',
      priceMonthly: 700000,
      priceYearly: 7000000,
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: proEntitlements
    },
    create: {
      id: 'seed-plan-pro',
      tier: 'PRO',
      name: 'JAMANVAAR PRO',
      description: 'Flagship Edition: Everything in Core + Wireless Captain, QR Table Ordering, Mesh Sync & AI (364 features total)',
      priceMonthly: 700000, // paise = ₹7,000
      priceYearly: 7000000, // paise = ₹70,000
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: proEntitlements
    }
  });

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
  console.log(`Plans: ${corePlan.name} + JAMANVAAR PRO`);
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
