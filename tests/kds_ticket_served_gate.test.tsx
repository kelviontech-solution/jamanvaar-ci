// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { KdsTicketCard } from '../apps/restaurant-system/kds/src/KdsTicketCard';
import { ticketAge } from '../apps/restaurant-system/kds/src/kdsLogic';
import type { KOTRecord } from '@jamanvaar/types';

/**
 * Only the captain who physically carries a dish to the table should ever mark it served — that is the
 * whole reason Captain has its own "Food Ready for Delivery" queue. The kitchen marking a table order
 * served itself (while nobody actually took the plate out) defeats that queue entirely. A counter/takeaway
 * order has no table and no captain to do it, so the kitchen keeps the button for those.
 */
const readyKot = (over: Partial<KOTRecord> = {}): KOTRecord => ({
  id: 'kot-1',
  kotNumber: 'KOT-01',
  orderId: 'order-1',
  orderNumber: 'ORD-1',
  tokenNumber: '12',
  tableNumber: '5',
  orderType: 'DINE_IN',
  station: 'Main Kitchen',
  type: 'NEW',
  items: [{ id: 'item-1', menuItemId: 'm-1', name: 'Paneer Tikka', quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'READY' }],
  cashierName: 'Ravi',
  createdAt: new Date().toISOString(),
  printed: false,
  status: 'READY',
  ...over
}) as KOTRecord;

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
});

function renderCard(kot: KOTRecord, captainHandlesService: boolean, onServe = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const element = React.createElement(KdsTicketCard, {
    kot,
    age: ticketAge(kot, Date.now(), 15),
    progress: { ready: 1, total: 1, tickets: 1 },
    orderTypeLabel: 'Dine-in',
    takenBy: null,
    onToggleDish: () => undefined,
    onStart: () => undefined,
    onAllReady: () => undefined,
    onServe,
    captainHandlesService,
    onRecall: () => undefined,
    onDismiss: () => undefined,
    priority: 'NORMAL' as const,
    onPriority: () => undefined,
    onReprint: () => undefined
  });
  act(() => root!.render(element));
  return onServe;
}

const findButtonByText = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

describe('a table order can only be marked served by the captain who delivers it, not by the kitchen', () => {
  it('a table order with Captain available shows "Waiting for captain" instead of a Served button', () => {
    const onServe = renderCard(readyKot({ tableNumber: '5' }), true);
    expect(container.textContent).toContain('Waiting for captain');
    expect(findButtonByText('Served')).toBeUndefined();
    expect(onServe).not.toHaveBeenCalled();
  });

  it('a counter/takeaway order (no table) still lets the kitchen mark it served, even with Captain available', () => {
    const onServe = renderCard(readyKot({ tableNumber: undefined }), true);
    const servedButton = findButtonByText('Served');
    expect(servedButton).toBeTruthy();
    act(() => servedButton!.click());
    expect(onServe).toHaveBeenCalledTimes(1);
  });

  it('a restaurant with no Captain app keeps the kitchen\'s own Served button for table orders too, so nothing gets stranded', () => {
    const onServe = renderCard(readyKot({ tableNumber: '5' }), false);
    const servedButton = findButtonByText('Served');
    expect(servedButton).toBeTruthy();
    act(() => servedButton!.click());
    expect(onServe).toHaveBeenCalledTimes(1);
  });
});
