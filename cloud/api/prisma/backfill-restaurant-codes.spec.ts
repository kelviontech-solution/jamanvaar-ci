import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { backfillRestaurantCodes } from './backfill-restaurant-codes';

describe('backfillRestaurantCodes', () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  let withPhoneId: string;
  let noPhoneId: string;

  beforeAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);
      const r1 = await tx.restaurant.create({ data: { name: `TEST Backfill With Phone ${stamp}` } });
      const r2 = await tx.restaurant.create({ data: { name: `TEST Backfill No Phone ${stamp}` } });
      await tx.branch.create({ data: { restaurantId: r1.id, name: 'Main', code: 'MAIN' } });
      await tx.branch.create({ data: { restaurantId: r2.id, name: 'Main', code: 'MAIN' } });
      await tx.user.create({ data: { restaurantId: r1.id, email: `bf1-${stamp}@example.com`, fullName: 'Owner', role: 'OWNER', phone: '9998887770' } });
      await tx.user.create({ data: { restaurantId: r2.id, email: `bf2-${stamp}@example.com`, fullName: 'Owner', role: 'OWNER' } }); // no phone
      withPhoneId = r1.id;
      noPhoneId = r2.id;
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);
      await tx.restaurant.deleteMany({ where: { id: { in: [withPhoneId, noPhoneId] } } });
    });
    await prisma.$disconnect();
  });

  it('assigns a real code from the owner phone when one exists, and a flagged fallback when it does not', async () => {
    const result = await backfillRestaurantCodes(prisma);
    expect(result.updated).toBeGreaterThanOrEqual(2);

    const [withPhone, noPhone] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_context = 'true'`);
      return Promise.all([
        tx.restaurant.findUniqueOrThrow({ where: { id: withPhoneId } }),
        tx.restaurant.findUniqueOrThrow({ where: { id: noPhoneId } })
      ]);
    });

    expect(withPhone.restaurantCode).toBe('JM9998887770');
    expect(withPhone.restaurantCodeIsFallback).toBe(false);

    expect(noPhone.restaurantCode).toMatch(/^JM/);
    expect(noPhone.restaurantCodeIsFallback).toBe(true);
  });
});
