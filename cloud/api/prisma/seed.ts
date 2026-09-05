/**
 * Development seed for cloud/api. Targets whatever database DATABASE_URL
 * points at (never live_db.json, never the local offline-runtime data) —
 * safe to run repeatedly against a scratch dev database.
 */
import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
        status: 'ACTIVE'
      }
    });
  }

  const corePlan = await tx.plan.upsert({
    where: { id: 'seed-plan-core' },
    update: {},
    create: {
      id: 'seed-plan-core',
      tier: 'CORE',
      name: 'JAMANVAAR CORE',
      priceMonthly: 500000, // paise = ₹5,000
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: {
        posTerminal: true,
        offlineBilling: true,
        menuManagement: true,
        kotKdsRouting: true,
        receiptPrinting: true,
        salesAndGstReports: true,
        captainApp: false
      }
    }
  });

  await tx.plan.upsert({
    where: { id: 'seed-plan-pro' },
    update: {},
    create: {
      id: 'seed-plan-pro',
      tier: 'PRO',
      name: 'JAMANVAAR PRO',
      priceMonthly: 700000, // paise = ₹7,000
      maxBranches: 5,
      maxDevices: 20,
      maxUsers: 50,
      entitlements: {
        posTerminal: true,
        offlineBilling: true,
        menuManagement: true,
        kotKdsRouting: true,
        receiptPrinting: true,
        salesAndGstReports: true,
        captainApp: true
      }
    }
  });

  const demoRestaurant = await tx.restaurant.upsert({
    where: { id: 'seed-restaurant-demo' },
    update: {},
    create: {
      id: 'seed-restaurant-demo',
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

  await tx.user.upsert({
    where: { restaurantId_email: { restaurantId: demoRestaurant.id, email: 'owner@demo.jamanvaar.app' } },
    update: {},
    create: {
      restaurantId: demoRestaurant.id,
      branchId: demoBranch.id,
      email: 'owner@demo.jamanvaar.app',
      fullName: 'Demo Owner',
      role: 'OWNER',
      status: 'PENDING_ACTIVATION',
      invitedAt: new Date()
    }
  });

  const existingSubscription = await tx.subscription.findFirst({
    where: { restaurantId: demoRestaurant.id }
  });
  if (!existingSubscription) {
    await tx.subscription.create({
      data: {
        restaurantId: demoRestaurant.id,
        planId: corePlan.id,
        status: 'TRIAL',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
