import React from 'react';
import type { Order, Restaurant, Outlet } from '@jamanvaar/types';
import { formatDate, formatTime, getOrderSource, ORDER_SOURCE_LABELS, resolveMenuImage } from '@jamanvaar/utils';
import { summarizeBillingLedger, isPendingCollection, formatBillingMoney } from './billingLedger';

export function BillingStatementDocument({ orders, restaurant, outlet, scope, filters }: {
  orders: Order[]; restaurant?: Restaurant | null; outlet?: Outlet | null; scope: string; filters: string;
}) {
  const s = summarizeBillingLedger(orders);
  const generated = new Date();
  return <section data-print-doc="billing-statement" className="hidden print:block" style={{ color: '#173348', fontFamily: 'Arial, sans-serif', fontSize: 10 }}>
    <style>{`@media print {
      [data-print-doc="billing-statement"] table { break-inside: auto; page-break-inside: auto; }
      [data-print-doc="billing-statement"] thead { display: table-header-group; }
      [data-print-doc="billing-statement"] tr { break-inside: avoid; }
      [data-print-doc="billing-statement"] th, [data-print-doc="billing-statement"] td { padding: 8px 6px; border-bottom: 1px solid #e9e3da; vertical-align: top; overflow-wrap: anywhere; }
      [data-print-doc="billing-statement"] tbody tr:nth-child(even) { background: #faf7f2; }
    }`}</style>
    <div style={{ borderTop: '5px solid #ec6b10', borderBottom: '1px solid #e9e3da', padding: '18px 0', display: 'flex', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <img src={resolveMenuImage(restaurant?.logoUrl || '/assets/branding/jamanvaar-logo.png')} alt="Restaurant logo" style={{ width: 100, height: 75, objectFit: 'contain' }} />
        <div>
          <div style={{ color: '#b8560e', letterSpacing: 2, fontSize: 9, marginBottom: 5 }}>JAMANVAAR · RESTAURANT OPERATIONS</div>
          <h1 style={{ fontSize: 24, margin: '0 0 5px', fontWeight: 800 }}>{restaurant?.name || 'Restaurant'}</h1>
          {outlet?.name && <div style={{ fontWeight: 700, marginBottom: 4 }}>{outlet.name}</div>}
          <div>{outlet?.address || restaurant?.address}</div>
          <div style={{ color: '#586675', marginTop: 4 }}>{[restaurant?.gstin && `GSTIN: ${restaurant.gstin}`, restaurant?.fssaiNumber && `FSSAI: ${restaurant.fssaiNumber}`, (outlet?.phone || restaurant?.phone) && `Phone: ${outlet?.phone || restaurant?.phone}`, restaurant?.email].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 190 }}>
        <h2 style={{ fontSize: 19, margin: '0 0 8px' }}>Billing statement</h2>
        <div>{scope}</div><div style={{ color: '#586675', marginTop: 4 }}>Generated {formatDate(generated)} · {formatTime(generated)}</div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>{orders.length} records · INR</div>
      </div>
    </div>
    <div style={{ margin: '12px 0', color: '#586675' }}>Filters: {filters}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {[
        ['Total order value', s.orderValue], ['Collected after refunds', s.collected], ['Pending collection', s.pending], ['Refunds', s.refunds]
      ].map(([label, amount]) => <div key={label} style={{ background: '#faf7f2', border: '1px solid #e9e3da', borderRadius: 10, padding: 12 }}>
        <div style={{ color: '#586675', fontSize: 9, marginBottom: 8 }}>{label}</div><strong style={{ fontSize: 20 }}>{formatBillingMoney(Number(amount))}</strong>
      </div>)}
    </div>
    <p style={{ color: '#586675', margin: '0 0 16px' }}>Order value includes accepted orders awaiting payment. Pending collection is not collected revenue. Draft and cancelled orders are excluded from totals. GST shown per invoice uses its recorded tax amount.</p>
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead style={{ color: '#fff', background: '#173348' }}><tr>
        {['Invoice / Token', 'Date & time', 'Source / Type', 'Customer / Table', 'Items', 'GST', 'Total', 'Tender', 'Payment / Order status'].map(h => <th key={h} style={{ textAlign: ['GST', 'Total'].includes(h) ? 'right' : 'left', fontWeight: 700 }}>{h}</th>)}
      </tr></thead>
      <tbody>{orders.map(o => <tr key={o.id}>
        <td><strong>{(o as Order & { invoiceNumber?: string }).invoiceNumber || o.orderNumber}</strong><div style={{ color: '#b8560e', marginTop: 4 }}>#{o.tokenNumber}</div></td>
        <td>{formatDate(o.createdAt)}<div>{formatTime(o.createdAt)}</div></td>
        <td><strong>{ORDER_SOURCE_LABELS[getOrderSource(o)]}</strong><div>{o.orderType.replaceAll('_', ' ')}</div></td>
        <td>{o.customerName || 'Walk-in'}<div>{o.tableNumber ? `Table ${o.tableNumber}` : '—'}</div></td>
        <td>{o.items.map(i => `${i.quantity}× ${i.name}`).join('; ')}</td>
        <td style={{ textAlign: 'right' }}>{formatBillingMoney(o.taxAmount || 0)}</td>
        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatBillingMoney(o.totalAmount)}</td>
        <td>{o.paymentMethod?.replaceAll('_', ' ')}</td>
        <td><strong style={{ color: isPendingCollection(o) ? '#b8560e' : '#173348' }}>{isPendingCollection(o) ? 'Pending collection' : o.paymentStatus}</strong><div style={{ marginTop: 4 }}>{o.orderStatus}</div></td>
      </tr>)}</tbody>
    </table>
    <footer style={{ marginTop: 20, borderTop: '2px solid #ec6b10', paddingTop: 10, display: 'flex', justifyContent: 'space-between', color: '#586675', fontSize: 9 }}>
      <span>Prepared for {restaurant?.name || 'Restaurant'} · {outlet?.name || 'All orders in scope'}</span><span>Powered by JAMANVAAR · kelviontech</span>
    </footer>
  </section>;
}
