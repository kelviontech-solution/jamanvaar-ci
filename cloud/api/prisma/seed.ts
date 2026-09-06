/**
 * Development seed for cloud/api. Targets whatever database DATABASE_URL
 * points at (never live_db.json, never the local offline-runtime data) —
 * safe to run repeatedly against a scratch dev database.
 */
import { randomBytes, createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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

  let superAdminPassword: string | null = null;
  const existingSuperAdmin = await tx.platformUser.findUnique({ where: { email: superAdminEmail } });
  if (!existingSuperAdmin) {
    superAdminPassword = randomBytes(9).toString('base64url');
    await tx.platformUser.create({
      data: {
        email: superAdminEmail,
        passwordHash: await bcrypt.hash(superAdminPassword, 10),
        fullName: 'JAMANVAAR Super Admin',
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE'
      }
    });
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
    posAssistant: true,
    restaurantAdmin: true,
    captainApp: false,
    advancedCaptainReports: false,
    advancedServiceWorkflow: false,
    qrTableOrdering: false
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
    qrTableOrdering: true
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

  let demoOwnerActivationToken: string | null = null;
  const existingDemoOwner = await tx.user.findUnique({
    where: { restaurantId_email: { restaurantId: demoRestaurant.id, email: 'owner@demo.jamanvaar.app' } }
  });
  if (!existingDemoOwner) {
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

  // Seed AppRelease Catalog for all 6 JAMANVAAR client applications
  const appReleases = [
    {
      appCode: 'POS',
      version: '2.4.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '2.0.0',
      supportedPlatforms: ['windows', 'electron'],
      releaseNotes: 'Offline-first counter billing, fast token orders, multi-payment tenders, KOT routing, ESC/POS thermal printing.',
      downloadUrl: '/releases/jamanvaar-pos-setup-2.4.0.exe'
    },
    {
      appCode: 'RESTAURANT_ADMIN',
      version: '2.4.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '2.0.0',
      supportedPlatforms: ['web'],
      releaseNotes: 'Restaurant back-office portal, menu management, floor layouts, staff roles, statutory reports, cloud sync.',
      downloadUrl: 'http://localhost:5176'
    },
    {
      appCode: 'CAPTAIN',
      version: '2.1.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '2.0.0',
      supportedPlatforms: ['android', 'web'],
      releaseNotes: 'Wireless table-side waiter ordering, instant course firing, kitchen ready alerts, tip tracking.',
      downloadUrl: '/releases/jamanvaar-captain-v2.1.0.apk'
    },
    {
      appCode: 'KDS',
      version: '2.0.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '1.8.0',
      supportedPlatforms: ['web', 'android'],
      releaseNotes: 'Multi-station kitchen routing, cook time color alerts, bump bar support, course synchronization.',
      downloadUrl: '/releases/jamanvaar-kds-v2.0.0.apk'
    },
    {
      appCode: 'KIOSK',
      version: '1.8.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '1.5.0',
      supportedPlatforms: ['windows', 'android'],
      releaseNotes: 'Self-ordering guest kiosk, dynamic combos, custom modifiers, UPI BharatQR display, auto-idle reset.',
      downloadUrl: '/releases/jamanvaar-kiosk-v1.8.0.exe'
    },
    {
      appCode: 'KIOSK_ADMIN',
      version: '1.8.0',
      channel: 'STABLE' as const,
      minSupportedVersion: '1.5.0',
      supportedPlatforms: ['web'],
      releaseNotes: 'Kiosk terminal administration, station lock, screen branding, peripheral hardware configuration.',
      downloadUrl: 'http://localhost:5177'
    }
  ];

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
      update: { value: s.value, category: s.category, description: s.description },
      create: s
    });
  }


  console.log('--- Seed complete ---');
  console.log(`Plans: ${corePlan.name} + JAMANVAAR PRO`);
  console.log(`Demo restaurant: ${demoRestaurant.name} (${demoRestaurant.id})`);
  if (superAdminPassword) {
    console.log('');
    console.log('Super Admin created — save this password now, it is not stored or shown again:');
    console.log(`  email:    ${superAdminEmail}`);
    console.log(`  password: ${superAdminPassword}`);
  } else {
    console.log(`Super Admin already exists: ${superAdminEmail}`);
  }
  if (demoOwnerActivationToken) {
    console.log('');
    console.log('Demo restaurant owner invitation — save this token now, it is not stored or shown again:');
    console.log(`  restaurantId: ${demoRestaurant.id}`);
    console.log(`  email:        owner@demo.jamanvaar.app`);
    console.log(`  token:        ${demoOwnerActivationToken}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
