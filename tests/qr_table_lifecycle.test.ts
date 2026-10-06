import { describe, it, expect, beforeEach } from 'vitest';
import { db, TableRepository } from '@jamanvaar/database';
import type { Order } from '@jamanvaar/types';
describe('QR tables use the existing floor lifecycle',()=>{
 beforeEach(()=>{db.resetToDefaultSeed();db.orders.length=0;});
 const add=(id:string,status='NEW',tableId=db.tables[0].id)=>{const order={id,tableId,source_type:'QR_TABLE',orderType:'DINE_IN',orderStatus:status,createdAt:'2026-10-06T12:00:00.000Z'} as Order;db.orders.push(order);return order;};
 it('online payment drafts do not occupy a table; verified admission does',()=>{const o=add('qr-a','DRAFT');expect(TableRepository.reconcileQrTableOrders()).toBe(0);o.orderStatus='NEW';expect(TableRepository.reconcileQrTableOrders()).toBe(1);expect(db.tables[0]).toMatchObject({status:'OCCUPIED',currentOrderId:'qr-a'});});
 it('completing one of multiple table orders keeps the table occupied until all are completed',()=>{const a=add('qr-a'),b=add('qr-b');TableRepository.reconcileQrTableOrders();a.orderStatus='COMPLETED';TableRepository.releaseSettledTables();TableRepository.reconcileQrTableOrders();expect(db.tables[0].currentOrderId).toBe(b.id);b.orderStatus='COMPLETED';TableRepository.releaseSettledTables();TableRepository.reconcileQrTableOrders();expect(db.tables[0]).toMatchObject({status:'AVAILABLE',currentOrderId:undefined});});
 it('does not replace an active Captain order or unblock a manually blocked table',()=>{const active=add('captain-a');active.source_type='CAPTAIN';db.tables[0].currentOrderId=active.id;add('qr-b');expect(TableRepository.reconcileQrTableOrders()).toBe(0);db.tables[0].currentOrderId=undefined;db.tables[0].status='BLOCKED';expect(TableRepository.reconcileQrTableOrders()).toBe(0);});
 it('table identity prevents same-number tables in another branch receiving the order',()=>{add('qr-other','NEW','another-branch-table');expect(TableRepository.reconcileQrTableOrders()).toBe(0);});
});
