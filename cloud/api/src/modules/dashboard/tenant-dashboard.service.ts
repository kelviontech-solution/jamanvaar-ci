import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ts } from '../../common/sql';
import { deviceHealth, ONLINE_WITHIN_MS } from '../../common/device-health';

export function dashboardDates(period: string, timezone: string, from?: string, to?: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  let end = `${get('year')}-${get('month')}-${get('day')}`, start = end;
  const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  if (period === 'YESTERDAY') start = end = shift(end, -1);
  else if (period === '7_DAYS') start = shift(end, -6);
  else if (period === '30_DAYS') start = shift(end, -29);
  else if (period === 'THIS_MONTH') start = end.slice(0, 7) + '-01';
  else if (period === 'THIS_YEAR') start = end.slice(0, 4) + '-01-01';
  else if (period === 'CUSTOM') {
    const valid = (v?: string): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v);
    if (!valid(from) || !valid(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new BadRequestException('Choose a valid date range of up to one year');
    start = from; end = to;
  } else if (period !== 'TODAY') throw new BadRequestException('Invalid dashboard period');
  return { from: start, to: end, timezone, period };
}

@Injectable()
export class TenantDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async branchScope(user: User, requested?: string, deviceId?: string): Promise<string | null> {
    if (!['OWNER', 'MANAGER'].includes(user.role)) throw new ForbiddenException('Restaurant dashboard requires owner or manager access');
    let assigned = user.branchId;
    if (user.role !== 'OWNER' && !assigned && deviceId) assigned = (await this.prisma.runAsTenant(user.restaurantId, tx => tx.device.findFirst({ where: { id: deviceId, restaurantId: user.restaurantId }, select: { branchId: true } })))?.branchId ?? null;
    if (user.role !== 'OWNER' && (!assigned || (requested && requested !== assigned))) throw new ForbiddenException('You can only view your assigned branch');
    const branchId = user.role === 'OWNER' ? requested && requested !== 'all' ? requested : null : assigned;
    if (branchId && !await this.prisma.runAsTenant(user.restaurantId, tx => tx.branch.findFirst({ where: { id: branchId, restaurantId: user.restaurantId }, select: { id: true } }))) throw new ForbiddenException('Branch is outside your restaurant');
    return branchId;
  }

  async get(user: User, query: { branchId?: string; period?: string; from?: string; to?: string; source?: string }, deviceId?: string) {
    const started = performance.now(), branchId = await this.branchScope(user, query.branchId, deviceId);
    if (query.source && !['ALL','POS','CAPTAIN','KIOSK','QR','WHATSAPP','ONLINE'].includes(query.source)) throw new BadRequestException('Invalid order source');
    return this.prisma.runAsTenant(user.restaurantId, async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: user.restaurantId }, select: { id: true, name: true, currency: true, timezone: true } });
      const branches = await tx.branch.findMany({ where: { restaurantId: user.restaurantId, ...(branchId ? { id: branchId } : {}) }, select: { id: true, name: true, code: true, timezone: true, status: true }, orderBy: { name: 'asc' } });
      const timezone = branches.find(b => b.id === branchId)?.timezone ?? restaurant.timezone;
      const dates = dashboardDates(query.period ?? 'TODAY', timezone, query.from, query.to);
      const source = query.source && query.source !== 'ALL' ? Prisma.sql`AND o.source = ${query.source}` : Prisma.empty;
      const scope = Prisma.sql`o."restaurantId" = ${user.restaurantId} ${branchId ? Prisma.sql`AND o."branchId" = ${branchId}` : Prisma.empty} ${source}`;
      const local = Prisma.sql`timezone(${timezone}, timezone('UTC', o."createdAt"))`;
      const from = new Date(`${dates.from}T00:00:00Z`), to = new Date(`${dates.to}T00:00:00Z`);
      const range = Prisma.sql`o."createdAt" >= ${ts(new Date(from.getTime() - 86400000))} AND o."createdAt" < ${ts(new Date(to.getTime() + 2 * 86400000))} AND (${local})::date >= ${dates.from}::date AND (${local})::date <= ${dates.to}::date`;
      // One canonical operational order per sale; gateway transactions contribute refunds, never another sale.
      const base = Prisma.sql`WITH refund_totals AS (
        SELECT po."externalOrderId", SUM(r.amount)::bigint AS amount FROM "Refund" r
        JOIN "PaymentTransaction" p ON p.id=r."paymentId" JOIN "Order" po ON po.id=p."orderId"
        WHERE r."restaurantId"=${user.restaurantId} AND po."restaurantId"=${user.restaurantId} AND r.status='SUCCESS'
        GROUP BY po."externalOrderId"
      ), allocation_totals AS (
        SELECT "orderId", SUM(amount) FILTER (WHERE kind='COLLECTION')::bigint AS collected, COALESCE(SUM(amount) FILTER (WHERE kind='REFUND'),0)::bigint AS refunded
        FROM "OrderPaymentEntry" WHERE "restaurantId"=${user.restaurantId} GROUP BY "orderId"
      ), original AS (
        SELECT o."branchId",o.source,o.status,o."paymentStatus",o."totalAmount",o.items,o.meta,o."createdAt",o."externalOrderId",o."tableLabel", ${local} AS local_time,
          COALESCE(allocation_totals.collected, CASE WHEN o."paymentStatus" IN ('SUCCESS','PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUNDED') AND o.status NOT IN ('CANCELLED','VOID','VOIDED') THEN o."totalAmount" ELSE 0 END)::bigint AS gross,
          GREATEST(COALESCE(refund_totals.amount,0),COALESCE(allocation_totals.refunded,0))::bigint AS gateway_refund
        FROM "SyncedOrder" o LEFT JOIN allocation_totals ON allocation_totals."orderId"=o.id LEFT JOIN refund_totals ON refund_totals."externalOrderId"=o."externalOrderId" WHERE ${scope} AND ${range}
      ), rows AS (SELECT *, LEAST(gross, CASE WHEN status='REFUNDED' OR "paymentStatus"='REFUNDED' THEN
          CASE WHEN jsonb_typeof(meta->'refundAmountPaise')='number' THEN GREATEST(gateway_refund,(meta->>'refundAmountPaise')::bigint) ELSE gross END
          ELSE gateway_refund END) AS refunded FROM original),
      sales AS MATERIALIZED (SELECT *, gross-refunded AS net FROM rows)`;
      // All financial widgets share one materialized sales dataset. Repeating
      // this CTE in six round trips multiplied scans and refund reconciliation.
      const financialQuery = Prisma.sql`${base}
        SELECT 'totals' AS kind, COALESCE(jsonb_agg(q),'[]'::jsonb) AS data FROM (
          SELECT COUNT(*) FILTER(WHERE status NOT IN ('DRAFT','CANCELLED','VOID','VOIDED'))::int AS orders, COUNT(*) FILTER(WHERE gross>0)::int AS paid, COALESCE(SUM(gross),0)::float8 AS gross, COALESCE(SUM(refunded),0)::float8 AS refunds, COALESCE(SUM(net),0)::float8 AS sales, COUNT(*) FILTER(WHERE COALESCE("paymentStatus",'PENDING') NOT IN ('SUCCESS','PAID','REFUNDED','PARTIALLY_REFUNDED','REFUND_PENDING') AND status NOT IN ('CANCELLED','VOID','VOIDED','REFUNDED'))::int AS pending, COALESCE(SUM(GREATEST(0,"totalAmount"-gross)) FILTER(WHERE COALESCE("paymentStatus",'PENDING') NOT IN ('SUCCESS','PAID','REFUNDED','PARTIALLY_REFUNDED','REFUND_PENDING') AND status NOT IN ('CANCELLED','VOID','VOIDED','REFUNDED')),0)::float8 AS pending_amount FROM sales
        ) q
        UNION ALL SELECT 'trend', COALESCE(jsonb_agg(q),'[]'::jsonb) FROM (
          SELECT to_char(local_time, ${dates.from === dates.to ? 'HH24:00' : 'YYYY-MM-DD'}) AS bucket, COALESCE(SUM(net),0)::float8 AS sales, COUNT(*) FILTER(WHERE gross>0)::int AS orders FROM sales GROUP BY 1 ORDER BY 1
        ) q
        UNION ALL SELECT 'byBranch', COALESCE(jsonb_agg(q),'[]'::jsonb) FROM (
          SELECT "branchId", COALESCE(SUM(net),0)::float8 AS sales, COUNT(*) FILTER(WHERE gross>0)::int AS "paidOrders", COUNT(*) FILTER(WHERE status NOT IN ('DRAFT','CANCELLED','VOID','VOIDED'))::int AS orders FROM sales GROUP BY 1
        ) q
        UNION ALL SELECT 'bySource', COALESCE(jsonb_agg(q),'[]'::jsonb) FROM (
          SELECT source, COALESCE(SUM(net),0)::float8 AS sales, COUNT(*) FILTER(WHERE status NOT IN ('DRAFT','CANCELLED','VOID','VOIDED'))::int AS orders FROM sales GROUP BY 1 ORDER BY 1
        ) q
        UNION ALL SELECT 'topItems', COALESCE(jsonb_agg(q),'[]'::jsonb) FROM (
          SELECT COALESCE(item->>'menuItemId',item->>'externalItemId',item->>'name') AS id, COALESCE(item->>'name','Unnamed item') AS name,
          SUM(CASE WHEN jsonb_typeof(item->'quantity')='number' THEN (item->>'quantity')::numeric ELSE 0 END)::float8 AS units,
          SUM((CASE WHEN jsonb_typeof(item->'lineTotal')='number' THEN (item->>'lineTotal')::numeric WHEN jsonb_typeof(item->'totalPrice')='number' THEN (item->>'totalPrice')::numeric ELSE 0 END) * net / NULLIF("totalAmount",0))::float8 AS revenue
          FROM sales, jsonb_array_elements(CASE WHEN jsonb_typeof(items)='array' THEN items ELSE '[]'::jsonb END) item WHERE gross>0 AND item->>'kitchenStatus' IS DISTINCT FROM 'CANCELLED' GROUP BY 1,2 ORDER BY revenue DESC NULLS LAST LIMIT 10
        ) q
        UNION ALL SELECT 'recent', COALESCE(jsonb_agg(q),'[]'::jsonb) FROM (
          SELECT "externalOrderId", "branchId", source, status, "paymentStatus", "tableLabel", "totalAmount", to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", meta->>'orderNumber' AS "orderNumber", meta->>'tokenNumber' AS "tokenNumber" FROM sales ORDER BY "createdAt" DESC LIMIT 12
        ) q`;
      const [finance, fleet, fleetCounts, tables, qr, stock, apps, alertDevices] = await Promise.all([
        tx.$queryRaw<Array<{kind:string;data:any[]}>>(financialQuery),
        tx.device.findMany({ where: { restaurantId: user.restaurantId, ...(branchId ? { branchId } : {}) }, select: { id:true,name:true,type:true,branchId:true,status:true,lastSeenAt:true,lastSyncAt:true,syncStatus:true,syncError:true,pendingSyncCount:true,appVersion:true,kitchenStation:true,isLocked:true }, orderBy: { name: 'asc' }, take: 1000 }),
        tx.$queryRaw<any[]>(Prisma.sql`SELECT type, "branchId", COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='ACTIVE')::int AS active, COUNT(*) FILTER(WHERE status='ACTIVE' AND "lastSeenAt">=${ts(new Date(Date.now()-ONLINE_WITHIN_MS))})::int AS online FROM "Device" WHERE "restaurantId"=${user.restaurantId} ${branchId ? Prisma.sql`AND "branchId"=${branchId}` : Prisma.empty} GROUP BY type,"branchId"`),
        tx.$queryRaw<any[]>(Prisma.sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE payload->>'status'='OCCUPIED')::int AS occupied FROM "SyncedEntity" WHERE "restaurantId"=${user.restaurantId} AND "entityType"='DINING_TABLE' AND payload->>'deleted' IS DISTINCT FROM 'true' ${branchId ? Prisma.sql`AND payload->>'branchId'=${branchId}` : Prisma.empty}`),
        tx.qrCode.groupBy({ by:['branchId'], where: { restaurantId:user.restaurantId,status:'ACTIVE',...(branchId ? {branchId} : {}) },_count:{_all:true} }),
        tx.$queryRaw<any[]>(Prisma.sql`WITH stock AS (
          SELECT e.payload->>'name' AS name,e.payload->>'branchId' AS "branchId",
            CASE WHEN jsonb_typeof(e.payload->'openingStock')='number' THEN (e.payload->>'openingStock')::float8 + COALESCE(m.delta,0)
              WHEN jsonb_typeof(e.payload->'currentStock')='number' THEN (e.payload->>'currentStock')::float8 ELSE NULL END AS balance,
            CASE WHEN jsonb_typeof(e.payload->'minStockLevel')='number' THEN (e.payload->>'minStockLevel')::float8 ELSE 0 END AS minimum
          FROM "SyncedEntity" e LEFT JOIN (
            SELECT "itemId","branchId",SUM("quantityDelta") AS delta FROM "InventoryMovement" WHERE "restaurantId"=${user.restaurantId} GROUP BY "itemId","branchId"
          ) m ON m."itemId"=e."externalId" AND m."branchId" IS NOT DISTINCT FROM e.payload->>'branchId'
          WHERE e."restaurantId"=${user.restaurantId} AND e."entityType"='INVENTORY_ITEM' AND e.payload->>'deleted' IS DISTINCT FROM 'true'
            ${branchId ? Prisma.sql`AND e.payload->>'branchId'=${branchId}` : Prisma.empty}
        ) SELECT name,"branchId",balance FROM stock WHERE balance<=minimum ORDER BY balance,name LIMIT 20`),
        tx.applicationEntitlement.findMany({ where:{restaurantId:user.restaurantId,enabled:true,subscription:{status:{in:['ACTIVE','TRIAL']},expiresAt:{gt:new Date()}}},select:{appCode:true} }),
        tx.device.findMany({where:{restaurantId:user.restaurantId,...(branchId?{branchId}:{}),OR:[{isLocked:true},{syncError:{not:null}},{pendingSyncCount:{gt:0}},{status:'ACTIVE',lastSeenAt:null},{status:'ACTIVE',lastSeenAt:{lt:new Date(Date.now()-ONLINE_WITHIN_MS)}}]},select:{id:true,branchId:true,name:true,type:true,status:true,lastSeenAt:true,isLocked:true,syncError:true,pendingSyncCount:true},orderBy:{updatedAt:'desc'},take:20})
      ]);
      const {totals,trend,byBranch,bySource,topItems,recent}=Object.fromEntries(finance.map(row=>[row.kind,row.data]));
      const money=(n:unknown)=>Number(n??0)/100, t=totals[0], devices=fleet.map(d=>({...d,health:deviceHealth(d),syncState:d.syncError?'error':d.pendingSyncCount>0?'pending':!d.lastSyncAt?'never_synced':'synced'}));
      const branchesData=branches.map(branch=>{
        const sum=byBranch.find(b=>b.branchId===branch.id), mine=fleetCounts.filter(d=>d.branchId===branch.id), deployed=mine.filter(d=>d.active>0).map(d=>d.type);
        const qrCount=qr.find(q=>q.branchId===branch.id)?._count._all??0;
        return {...branch,sales:money(sum?.sales),orders:Number(sum?.orders??0),paidOrders:Number(sum?.paidOrders??0),averageOrder:sum?.paidOrders?money(sum.sales)/sum.paidOrders:0,devices:mine.reduce((n,d)=>n+d.total,0),online:mine.reduce((n,d)=>n+d.online,0),deployedProducts:[...deployed,...(qrCount?['QR_ORDERING']:[])],activeQrCodes:qrCount};
      });
      const alerts=[...alertDevices.map(d=>({kind:'DEVICE',branchId:d.branchId,title:d.name??d.type,detail:d.isLocked?'Device locked':d.syncError?'Sync error':d.pendingSyncCount?`${d.pendingSyncCount} pending changes`:deviceHealth(d).replace('_',' '),target:'SYNC'})),...stock.map(s=>({kind:'STOCK',branchId:s.branchId,title:s.name,detail:s.balance<=0?'Out of stock':'Low stock',target:'INVENTORY'}))];
      const unassigned=byBranch.find(b=>b.branchId===null);
      const deviceCounts=[...new Set(fleetCounts.map(d=>d.type))].map(type=>({type,total:fleetCounts.filter(d=>d.type===type).reduce((n,d)=>n+d.total,0),online:fleetCounts.filter(d=>d.type===type).reduce((n,d)=>n+d.online,0)}));
      return {restaurant,scope:{branchId,label:branchId?branches[0]?.name:'All branches',...dates,source:query.source??'ALL'},summary:{sales:money(t.sales),grossSales:money(t.gross),refunds:money(t.refunds),orders:t.orders,paidOrders:t.paid,averageOrder:t.paid?money(t.sales)/t.paid:0,pendingPayments:t.pending,pendingAmount:money(t.pending_amount),activeBranches:branches.filter(b=>b.status==='ACTIVE').length,tables:tables[0]?.total??0,occupiedTables:tables[0]?.occupied??0},trend:trend.map(p=>({...p,sales:money(p.sales)})),byBranch:branchesData,unassigned:unassigned?{sales:money(unassigned.sales),orders:unassigned.orders}:null,bySource:bySource.map(s=>({...s,sales:money(s.sales)})),topItems:topItems.map(i=>({...i,revenue:money(i.revenue)})),devices,deviceCounts,devicesTruncated:fleetCounts.reduce((n,d)=>n+d.total,0)>fleet.length,licensedProducts:[...new Set(apps.map(a=>a.appCode))],alerts,recentOrders:recent.map(o=>({...o,total:money(o.totalAmount),branchName:branches.find(b=>b.id===o.branchId)?.name??'Unassigned'})),generatedAt:new Date().toISOString(),queryMs:Math.round(performance.now()-started)};
    });
  }
}
