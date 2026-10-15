// Component verification only; no application identity, entitlements, or persistence is seeded.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmModal } from '/src/components/ConfirmModal';
import { CategoryModal } from '/src/components/CategoryModal';
import { OrderDetailModal } from '/src/components/OrderDetailModal';
import { RestoreModal } from '/src/components/RestoreModal';
import '/src/index.css';
const close = () => { document.body.dataset.closed = 'true'; };
const query = new URLSearchParams(location.search);
const order = { id:'component-probe', orderNumber:'PROBE', tokenNumber:1, createdAt:'2026-10-15T10:00:00Z', orderType:'TAKEAWAY', orderStatus:'CONFIRMED', paymentStatus:'SUCCESS', paymentMethod:'CASH', subtotal:100, taxAmount:5, totalAmount:105, items:[], payments:[] } as any;
createRoot(document.getElementById('root')!).render(query.get('mode') === 'order' ?
  <OrderDetailModal isOpen order={order} onClose={close} onOrderUpdated={()=>{}} /> : query.get('mode') === 'restore' ?
  <RestoreModal isOpen onClose={close} onRestored={()=>{}} /> : query.get('mode') === 'category' ?
  <CategoryModal isOpen categoryToEdit={null} onClose={close} onSaved={()=>{}} /> : query.get('mode') === 'confirm' ?
  <ConfirmModal isOpen isDanger={query.get('danger') === 'true'} message="Confirmation component verification" onClose={close} onConfirm={()=>{}} /> :
  <main className="font-sans p-5"><span data-font-probe>Typography probe</span><span className="animate-pulse-subtle" data-motion-probe>Motion probe</span></main>);
