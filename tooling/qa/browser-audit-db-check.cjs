const { PrismaClient } = require('@prisma/client');
const q = require('./browser-audit-lib.cjs');
async function main() {
 const db = new PrismaClient({ datasources: { db: { url: q.state.databaseUrl } } });
 try {
  const role = await db.$queryRawUnsafe('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
  const unscoped = await db.syncedOrder.count();
  const result = await db.$transaction(async tx => {
   await tx.$executeRawUnsafe("SET LOCAL app.is_platform_context='true'");
   const orders = await tx.syncedOrder.findMany({ where: { restaurantId: q.state.restaurantA.id } });
   const payments = await tx.paymentTransaction.findMany({ where: { restaurantId: q.state.restaurantA.id }, select: { id: true, orderId: true, status: true, amount: true, platformAmount: true, restaurantAmount: true, commissionBps: true, payoutId: true, order: { select: { externalOrderId: true, status: true, subtotal: true, taxAmount: true, totalAmount: true } } } });
   const duplicateIds = orders.map(o => o.externalOrderId).filter((id, i, all) => all.indexOf(id) !== i);
   const paidKiosk = orders.filter(o => o.source === 'KIOSK' && o.paymentStatus === 'SUCCESS');
   const pendingKiosk = orders.filter(o => o.source === 'KIOSK' && o.paymentStatus === 'PENDING');
   const stock = await tx.inventoryMovement.findMany({ where: { restaurantId: q.state.restaurantA.id }, select: { itemName: true, type: true, quantityDelta: true, seq: true } });
   const definitions = await tx.syncedEntity.count({ where: { restaurantId: q.state.restaurantA.id, entityType: 'INVENTORY_ITEM' } });
   const authReuse = await tx.auditLog.findMany({ where: { action: 'TENANT_REFRESH_TOKEN_REUSE' }, select: { restaurantId: true, action: true, createdAt: true } });
   const captain = orders.filter(o => o.externalOrderId === q.state.captainOrder.externalOrderId);
   q.expect(captain).toHaveLength(1); q.expect(captain[0].paymentStatus).toBe('SUCCESS'); q.expect(captain[0].totalAmount).toBe(31400);
   q.expect(duplicateIds).toHaveLength(0);
   q.expect(unscoped).toBe(0); q.expect(role[0].rolsuper).toBe(false); q.expect(role[0].rolbypassrls).toBe(false);
   return { role, unscopedVisibleOrders: unscoped, tenantAOrders: orders.length, duplicateExternalIds: duplicateIds, paidKiosk: paidKiosk.map(o => ({ id: o.externalOrderId, status: o.status, totalAmount: o.totalAmount, taxAmount: o.taxAmount, receiptTax: Number(o.meta?.cgstPaise || 0) + Number(o.meta?.sgstPaise || 0), kitchenStates: o.items.map(i => i.kitchenStatus) })), pendingKiosk: pendingKiosk.map(o => ({ id: o.externalOrderId, status: o.status, paymentStatus: o.paymentStatus, token: o.meta?.tokenNumber })), payments, inventoryCloudDefinitions: definitions, stockMovements: stock, authReuseEvents: authReuse, captainSettlement: { id: captain[0].externalOrderId, status: captain[0].status, paymentStatus: captain[0].paymentStatus, amount: captain[0].totalAmount } };
  });
  const connections = await db.$queryRawUnsafe('SELECT state, count(*)::int as connections FROM pg_stat_activity WHERE datname=$1 GROUP BY state', q.state.databaseName);
  result.databaseConnectionsAtObservation = connections;
  q.fs.writeFileSync(q.path.join(q.reportDir, 'database-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ role: role[0], unscopedVisibleOrders: unscoped, tenantAOrders: result.tenantAOrders, duplicateExternalIds: result.duplicateExternalIds.length, payments: result.payments.length, inventoryDefinitions: result.inventoryCloudDefinitions, inventoryMovements: result.stockMovements.length, authReuseEvents: result.authReuseEvents.length, connections }));
 } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
