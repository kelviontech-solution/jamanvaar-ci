// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db, BusinessDayRepository, KeyValueStore, CustomerRepository } from '@jamanvaar/database';
import type { KOTRecord } from '@jamanvaar/types';
import { PosCloseDayModal } from '../apps/restaurant-system/pos/src/components/days/PosCloseDayModal';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { useCaptainStore, heldForTable } from '../apps/restaurant-system/captain/src/store/captainStore';
import { ticketsForStation, needsCancellationAcknowledgement } from '../apps/restaurant-system/kds/src/kdsLogic';
import { hasOutstandingPayment, shouldRefreshGuestOrder } from '../apps/qr-guest/src/paymentProgress';
import { StatusScreen } from '../apps/qr-guest/src/App';
import { QrApi, type Placed } from '../apps/qr-guest/src/api';
import { billingEntry } from '../apps/restaurant-system/pos-admin/src/components/dashboard/dashboardDrilldown';
import { BranchBusinessDashboard } from '../apps/restaurant-system/pos-admin/src/components/dashboard/BranchBusinessDashboard';
import * as adminCloud from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';
import { PosLoyaltyRewards } from '../apps/restaurant-system/pos/src/components/customers/PosLoyaltyRewards';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true});
  KeyValueStore.reset();localStorage.clear();
  db.resetToDefaultSeed();db.orders=[];db.shifts=[];db.kots=[];db.cashMovements=[];
  BusinessDayRepository.getActiveBusinessDay();
  useCaptainStore.setState({cartItems:[]});useCaptainStore.getState().logout();
  usePosStore.getState().clearCart();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(() => {act(() => root.unmount());container.remove();vi.restoreAllMocks();vi.useRealTimers();});
const button=(text:string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.includes(text))!;
const ticket=(id:string,station:string,status:KOTRecord['status']='PREPARING'):KOTRecord => ({id,station,status,items:[],kotNumber:id,orderId:'order-'+id,orderNumber:id,tokenNumber:id,orderType:'DINE_IN',type:'FIRST',cashierName:'Test',printed:false,createdAt:new Date(Date.now()-14*3600000).toISOString()});
const placed=(patch:Partial<Placed>={}):Placed => ({publicOrderId:'audit-order',orderNumber:'QR-AUDIT',restaurantName:'Test restaurant',status:'COMPLETED',total:250,table:'1',placedAt:new Date().toISOString(),paymentMethod:'CASH_AT_COUNTER',paymentStatus:'PENDING',balance:{totalPaise:25000,collectedPaise:0,refundedPaise:0,outstandingPaise:25000,settlement:'UNPAID'},...patch});

describe('Further workflow regressions', () => {
  it('close-day modal safely toggles without changing hook order', () => {
    const day=BusinessDayRepository.getActiveBusinessDay();
    const render=(isOpen:boolean) => root.render(<PosCloseDayModal businessDay={day} isOpen={isOpen} onClose={() => {}} onClosedSuccess={() => {}}/>);
    act(() => render(false));act(() => render(true));expect(document.body.textContent).toContain('Business Day');
    expect(() => act(() => render(false))).not.toThrow();expect(() => act(() => render(true))).not.toThrow();
  });
  it('requires an entered cash count and accepts an empty drawer count of zero', () => {
    act(() => root.render(<PosCloseDayModal businessDay={BusinessDayRepository.getActiveBusinessDay()} isOpen onClose={() => {}} onClosedSuccess={() => {}}/>));
    act(() => button('Step 2').click());act(() => button('Step 3').click());
    expect(button('Step 4').disabled).toBe(true);
    expect(document.body.textContent).toContain('Cash count required');
    // Explicit use of the exact-count button records the operator's choice, including zero.
    act(() => button('Exact (').click());expect(button('Step 4').disabled).toBe(false);
  });
  it('completed food keeps refreshing an outstanding counter payment', () => {
    expect(shouldRefreshGuestOrder(placed(),false)).toBe(true);
    expect(shouldRefreshGuestOrder(placed({paymentStatus:'SUCCESS',balance:{totalPaise:25000,collectedPaise:25000,outstandingPaise:0,refundedPaise:0,settlement:'PAID'}}),true)).toBe(false);
    expect(hasOutstandingPayment(placed({balance:undefined,paymentStatus:'PARTIALLY_PAID'}))).toBe(true);
  });
  it('customer page obtains the later counter collection without a reload', async () => {
    const paid=placed({paymentStatus:'SUCCESS',balance:{totalPaise:25000,collectedPaise:25000,outstandingPaise:0,refundedPaise:0,settlement:'PAID'}});
    const status=vi.spyOn(QrApi,'status').mockResolvedValue(paid);
    function Fixture(){const [order,setOrder]=useState(placed());return <StatusScreen placed={order} setPlaced={setOrder} showStatus onMore={() => {}}/>;}
    await act(async () => root.render(<Fixture/>));
    expect(status).toHaveBeenCalledWith('audit-order');expect(document.body.textContent).toContain('Payment received');
    expect(document.body.textContent).not.toContain('Payment due at counter');
    expect(button('Refresh order & payment')).toBeDefined();
  });
  it('station queues never expand to similar names when empty', () => {
    const tickets=[ticket('curry','Curry Station'),ticket('main2','Main Kitchen 2')];
    expect(ticketsForStation(tickets,'Main Kitchen')).toEqual([]);
    expect(ticketsForStation(tickets,' curry station ')).toHaveLength(1);
    expect(ticketsForStation(tickets,'ALL')).toHaveLength(2);
  });
  it('a cancellation requires acknowledgement regardless of ticket creation age', () => {
    const cancelled=ticket('old','Main Kitchen','CANCELLED');
    expect(needsCancellationAcknowledgement(cancelled,new Set())).toBe(true);
    expect(needsCancellationAcknowledgement(cancelled,new Set(['old']))).toBe(false);
  });
  it('every captain sign-out entry retains unsent dishes', () => {
    const draft: ReturnType<typeof useCaptainStore.getState>['cartItems'][number] = {id:'unsent',menuItem:db.menuItems[0],quantity:1,unitPrice:250,totalPrice:250,selectedModifiers:[],isFired:false,status:'PENDING'};
    useCaptainStore.setState({cartItems:[draft],isLoggedIn:true});
    expect(useCaptainStore.getState().logout()).toBe(false);
    expect(useCaptainStore.getState().cartItems).toEqual([draft]);expect(useCaptainStore.getState().isLoggedIn).toBe(true);
    useCaptainStore.setState({cartItems:[]});expect(useCaptainStore.getState().logout()).toBe(true);
  });
  it('already-fired dishes do not block a normal staff sign-out', () => {
    useCaptainStore.setState({cartItems:[{id:'fired',menuItem:db.menuItems[0],quantity:1,unitPrice:250,totalPrice:250,selectedModifiers:[],isFired:true,status:'PREPARING'}]});
    expect(useCaptainStore.getState().logout()).toBe(true);
  });
  it('holds table drafts only within their original restaurant and branch, including across reloads', () => {
    KeyValueStore.set('jamanvaar_tenant_id','restaurant-a');KeyValueStore.set('jamanvaar_bound_branch_id','branch-a');
    const table = db.tables[0];table.status='OCCUPIED';
    useCaptainStore.getState().selectTable(table);
    const draft = {id:'held-dish',menuItem:db.menuItems[0],quantity:1,unitPrice:250,totalPrice:250,selectedModifiers:[],isFired:false,status:'PENDING' as const};
    useCaptainStore.setState({cartItems:[draft]});expect(heldForTable(table.tableNumber)).toEqual([draft]);
    KeyValueStore.set('jamanvaar_bound_branch_id','branch-b');expect(heldForTable(table.tableNumber)).toEqual([]);
    // A stale in-memory cart must not write to a newly activated branch.
    useCaptainStore.setState({cartItems:[{...draft,quantity:2}]});expect(heldForTable(table.tableNumber)).toEqual([]);
    KeyValueStore.set('jamanvaar_bound_branch_id','branch-a');expect(heldForTable(table.tableNumber)).toEqual([draft]);
    KeyValueStore.set('jamanvaar_tenant_id','restaurant-b');expect(heldForTable(table.tableNumber)).toEqual([]);
    KeyValueStore.set('jamanvaar_captain_held_v1',JSON.stringify({[table.tableNumber]:[draft]}));
    expect(heldForTable(table.tableNumber)).toEqual([]);expect(KeyValueStore.get('jamanvaar_captain_held_v1')).not.toBeNull();
  });
  it('owner bill drill-down preserves local dates, QR source and outstanding filter', () => {
    expect(billingEntry({from:'2026-10-11T18:30:00Z',to:'2026-10-12T18:29:59Z',timezone:'Asia/Kolkata'},'QR','PENDING')).toEqual({from:'2026-10-12',to:'2026-10-12',source:'QR_TABLE',collection:'PENDING',search:undefined});
    expect(() => billingEntry({from:'2026-10-12',to:'2026-10-12',timezone:'Asia/Kolkata'},'WHATSAPP','ALL')).toThrow(/separate ordering workspace/);
  });
  it('owner dashboard actions open outstanding bills and the exact recent order', async () => {
    const data: adminCloud.TenantDashboard = {scope:{branchId:'branch-a',label:'Branch A',from:'2026-10-12',to:'2026-10-12',timezone:'Asia/Kolkata'},summary:{sales:100,grossSales:100,refunds:0,orders:2,averageOrder:100,pendingAmount:250,pendingPayments:1},trend:[],bySource:[],byBranch:[],unassigned:null,topItems:[],deviceCounts:[],alerts:[],recentOrders:[{externalOrderId:'canonical-order',branchName:'Branch A',source:'QR',status:'COMPLETED',total:250,tokenNumber:'QR-1'}],generatedAt:new Date().toISOString()};
    vi.spyOn(adminCloud,'fetchTenantDashboard').mockResolvedValue(data);const navigate=vi.fn();
    await act(async () => root.render(<BranchBusinessDashboard branchId="branch-a" onNavigate={navigate}/>));
    act(() => button('View bills').click());
    expect(navigate).toHaveBeenLastCalledWith('BILLING_SALES',{from:'2026-10-12',to:'2026-10-12',source:'ALL',collection:'PENDING',search:undefined});
    // Use the exact row action, rather than the plural outstanding-bills action.
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="View bill QR-1"]')!.click());
    expect(navigate).toHaveBeenLastCalledWith('BILLING_SALES',{from:'2026-10-12',to:'2026-10-12',source:'ALL',collection:'ALL',search:'canonical-order'});
  });
  it('shows an eligible reward without opening details and only redeems on request', () => {
    const customer=CustomerRepository.createCustomer({phone:'9000044411',name:'Reward guest',loyaltyPoints:200});
    CustomerRepository.updateProgramSettings({enabled:true,earnPoints:1,perRupeesSpent:10});CustomerRepository.updateReward('reward-100off',{isActive:true,pointsCost:150,discountAmount:100});
    usePosStore.getState().addItemToCart(db.menuItems[0]);usePosStore.getState().setSelectedCustomer(customer);
    act(() => root.render(<PosLoyaltyRewards/>));
    expect(container.querySelector('details')!.open).toBe(false);expect(button('Use reward')).toBeDefined();
    expect(customer.loyaltyPoints).toBe(200);expect(usePosStore.getState().cart.loyaltyRedemption).toBeUndefined();
    act(() => button('Use reward').click());expect(usePosStore.getState().cart.loyaltyRedemption?.pointsCost).toBe(150);
    expect(customer.loyaltyPoints).toBe(200); // settlement, not attachment, spends points
  });
});
