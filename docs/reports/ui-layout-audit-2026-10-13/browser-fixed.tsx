import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { db, NotificationRepository } from '@jamanvaar/database';
import { Modal, OrderSummaryCards, NotificationToastContainer } from '@jamanvaar/ui';
import { usePosStore } from '../../../apps/restaurant-system/pos/src/store/posStore';
import { PosBillingWorkspace } from '../../../apps/restaurant-system/pos/src/components/menu/PosBillingWorkspace';
import { PosHeader } from '../../../apps/restaurant-system/pos/src/components/layout/PosHeader';
import { CaptainHeader } from '../../../apps/restaurant-system/captain/src/components/layout/CaptainHeader';
import { CaptainNavigation } from '../../../apps/restaurant-system/captain/src/components/layout/CaptainNavigation';
import { KioskProductCard } from '../../../apps/kiosk-system/kiosk-user/src/KioskProductCard';
import { KioskReceiptDeliveryDialog } from '../../../apps/kiosk-system/kiosk-user/src/KioskReceiptDeliveryDialog';
import { KdsTicketCard } from '../../../apps/restaurant-system/kds/src/KdsTicketCard';
import { printElement } from '../../../packages/ui/src/printElement';

db.resetToDefaultSeed();
db.orders = [];
db.restaurant.name = 'Saffron Courtyard Restaurant with a long display name';
const manager = { id: 'ui-owner', fullName: 'UI Test Owner', username: 'uiowner', roleId: 'role-admin', isActive: true };
usePosStore.setState({ currentUser: manager, isAuthenticated: true });
usePosStore.getState().setOrderType('TAKEAWAY');
const dish = db.menuItems.find(item => item.isAvailable !== false)!;
usePosStore.getState().addItemToCart(dish);
const noop = () => {};

function Fixture() {
  const screen = new URLSearchParams(location.search).get('screen');
  const [details, setDetails] = useState(false);
  if (screen === 'pos') return <main data-jv-workspace="pos" className="h-dvh flex flex-col p-3 gap-3 min-w-0"><PosHeader /><PosBillingWorkspace /></main>;
  if (screen === 'captain') return <main data-jv-workspace="captain"><div className="sticky top-0 z-30 bg-white" data-testid="captain-sticky"><CaptainHeader onOpenNotifications={noop} onOpenQuickMessage={noop} /><CaptainNavigation activeTab="TABLES" onSelectTab={noop} onOpenMoreDrawer={noop} /></div><div style={{height:2000}}>Floor content</div></main>;
  if (screen === 'keyboard') return <KioskReceiptDeliveryDialog channel="EMAIL" onClose={noop} onDone={noop} onActivity={noop} onSend={async () => ({success:true,message:'Your test bill was sent.'})} />;
  if (screen === 'menu') return <main data-jv-workspace="kiosk" className="p-4"><div className="max-w-sm"><KioskProductCard item={dish} onAdd={() => usePosStore.getState().addItemToCart(dish)} onSelectDetails={() => setDetails(true)} /></div><Modal isOpen={details} onClose={() => setDetails(false)} title={dish.name}><p>{dish.description}</p></Modal></main>;
  if (screen === 'notifications') return <main data-jv-workspace="pos" className="p-4"><button id="show-notification" onClick={() => { NotificationRepository.createNotification({title:'Food ready for a very long table name',message:'Please deliver this order promptly and confirm service.',type:'FOOD_READY',targetRoles:['POS']}); }}>Show notification</button><NotificationToastContainer role="POS" /></main>;
  if (screen === 'summary') return <main data-jv-workspace="admin"><OrderSummaryCards orders={[{id:'ui-order', orderNumber:'MAIN-20261013-123',tokenNumber:'K-123',items:[],createdAt:new Date().toISOString(),orderType:'TAKEAWAY',totalAmount:250,subtotal:250,orderStatus:'CONFIRMED',paymentMethod:'CASH_AT_COUNTER',paymentStatus:'PENDING'} as any]} onView={() => setDetails(true)}/><Modal isOpen={details} onClose={() => setDetails(false)} title="Order details"><p>Same order, complete details</p></Modal></main>;
  if (screen === 'print') return <main><h1 id="unrelated">Order more and navigation</h1><section id="test-receipt"><h2>Saffron Courtyard</h2><p>Receipt MAIN-123, Total ₹250</p></section><button id="print-test" onClick={() => printElement('#test-receipt')}>Print</button></main>;
  if (screen === 'kds') {
    const kot={id:'ui-kot',orderId:'ui-order',kotNumber:'MAIN-20261013-123',tokenNumber:'K-123',tableNumber:'TN12',orderType:'DINE_IN',station:'Main Kitchen',status:'PREPARING',createdAt:new Date().toISOString(),items:Array.from({length:12},(_,i)=>({id:'line-'+i,menuItemId:dish.id,name:'Royal Gujarati Grand Thali with seasonal vegetables and traditional accompaniments '+i,quantity:i+1,status:'PREPARING',specialInstructions:i===0?'ALLERGY: peanuts':''}))};
    return <main data-jv-workspace="kds" className="kds-board h-dvh overflow-y-auto p-4"><div className="kds-grid kds-density-tv gap-4" style={{'--kds-card-width':'460px'} as React.CSSProperties}><KdsTicketCard kot={kot as any} age={{mins:15,secs:0,timeStr:'15:00',level:'late',prep:10} as any} progress={{ready:0,total:12,tickets:1} as any} takenBy="Test Captain" orderTypeLabel="Dine in" captainHandlesService={false} onToggleDish={noop} onStart={noop} onAllReady={noop} onServe={noop} onRecall={noop} onDismiss={noop} onPriority={noop} onReprint={noop} priority="URGENT" /></div></main>;
  }
  return <p>Choose a fixture.</p>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
Object.assign(window, { uiStore: usePosStore });
