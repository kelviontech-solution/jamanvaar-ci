import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('LiveVerify-9f3a-Temp!', 10);
  await prisma.platformUser.upsert({
    where: { email: 'live-verify@jamanvaar.local' },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      email: 'live-verify@jamanvaar.local',
      passwordHash,
      fullName: 'Live Verify',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('platform user ready');
}

main().finally(() => prisma.$disconnect());
