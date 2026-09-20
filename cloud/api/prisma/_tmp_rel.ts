import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const codes = ['POS', 'RESTAURANT_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];
  for (const appCode of codes) {
    const r = await prisma.appRelease.updateMany({ where: { appCode }, data: { minSupportedVersion: '0.0.1' } });
    console.log(appCode, r.count);
  }
}
main().finally(() => prisma.$disconnect());
