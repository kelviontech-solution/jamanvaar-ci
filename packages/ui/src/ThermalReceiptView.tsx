import React from 'react';
import { Order, ReceiptConfig, KOTRecord } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime, splitTax } from '@jamanvaar/utils';
import { JAMANVAAR_LOGOS } from './assets';
import { CheckCircle2, Phone, Mail, QrCode } from 'lucide-react';

export interface ThermalReceiptViewProps {
  order: Order;
  config?: Partial<ReceiptConfig>;
  paperSize?: '80mm' | '58mm';
  showQrCode?: boolean;
  onPrint?: () => void | Promise<void>;
  onWhatsApp?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  showActions?: boolean;
  className?: string;
}

export const ThermalReceiptView: React.FC<ThermalReceiptViewProps> = ({
  order,
  config = {},
  paperSize = '80mm',
  showQrCode = true,
  className = ''
}) => {
  // Only what this restaurant has entered is printed; a missing detail is left out, never invented.
  const restaurantName = config.restaurantName || '';
  const address = config.address || '';
  const phone = config.phone || '';
  const gstin = config.gstin || '';
  const fssaiNumber = config.fssaiNumber || '';
  const thankYouMessage = config.thankYouMessage || 'Thank you for dining with us!';
  const footerMessage = config.footerMessage || 'Visit again.';
  const is80mm = paperSize === '80mm';

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Physical Thermal Slip Simulation */}
      <div
        className={`bg-white rounded-xl border border-[#D5CEC2] shadow-2xl p-5 sm:p-6 text-[#1A202C] font-mono text-xs relative overflow-hidden transition-all ${
          is80mm ? 'w-full max-w-[380px]' : 'w-full max-w-[300px]'
        }`}
        style={{
          boxShadow: '0 15px 35px -10px rgba(11, 37, 58, 0.15), 0 0 0 1px rgba(213, 206, 194, 0.6)'
        }}
      >
        {/* Header: this restaurant's own identity. The product brand appears only in the footer. */}
        <div className="text-center pb-3 border-b border-dashed border-[#A0AEC0] space-y-1.5">
          {config.logoUrl && (
            <div className="flex justify-center items-center py-1">
              <img
                src={config.logoUrl}
                alt={restaurantName}
                className="object-contain mx-auto"
                style={{ maxHeight: is80mm ? '60px' : '46px', maxWidth: is80mm ? '180px' : '140px', width: 'auto', height: 'auto', display: 'block' }}
              />
            </div>
          )}

          <div className="space-y-0.5">
            {restaurantName && (
              <h2 className="font-black text-sm sm:text-base tracking-wider uppercase text-[#0B253A]">{restaurantName}</h2>
            )}
            {address && <p className="text-[10px] text-[#718096] leading-tight max-w-[280px] mx-auto">{address}</p>}
            {phone && <p className="text-[10px] text-[#718096]">Phone: {phone}</p>}
          </div>

          <div className="flex flex-wrap justify-center gap-x-2 text-[9px] text-[#4A5568] pt-1 font-semibold">
            {gstin && <span>GSTIN: {gstin}</span>}
            {fssaiNumber && <span>• FSSAI: {fssaiNumber}</span>}
          </div>
        </div>

        {/* Tax Invoice & Token Info */}
        <div className="py-2.5 border-b border-dashed border-[#A0AEC0] space-y-1 text-[11px]">
          <div className="flex justify-between items-center pb-1 border-b border-slate-100">
            <span className="font-black text-xs text-[#0B253A] uppercase tracking-wide">
              TAX INVOICE / RECEIPT
            </span>
            <span className="bg-[#E66817]/10 text-[#E66817] px-2 py-0.5 rounded font-black text-xs">
              TOKEN #{order.tokenNumber}
            </span>
          </div>

          <div className="flex justify-between text-[#4A5568] pt-1">
            <span>Invoice No:</span>
            <span className="font-bold text-[#0B253A]">{order.orderNumber}</span>
          </div>

          <div className="flex justify-between text-[#4A5568]">
            <span>Order Type:</span>
            <span className="font-bold text-[#0B253A]">
              {order.orderType} {order.tableNumber ? `(TABLE ${order.tableNumber})` : ''}
            </span>
          </div>

          <div className="flex justify-between text-[#718096] text-[10px]">
            <span>Date: {formatDate(order.createdAt)}</span>
            <span>Time: {formatTime(order.createdAt)}</span>
          </div>

          <div className="flex justify-between text-[#718096] text-[10px]">
            <span>{order.kioskId !== 'CLOUD-SYNC' ? `POS: ${order.kioskId || 'POS-01'}` : ''}</span>
            <span>{order.cashierName ? `Cashier: ${order.cashierName}` : order.captainName ? `Captain: ${order.captainName}` : ''}</span>
          </div>

          {order.customerName && (
            <div className="flex justify-between text-[#4A5568] text-[10px] pt-0.5">
              <span>Customer:</span>
              <span className="font-semibold">{order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}</span>
            </div>
          )}
        </div>

        {/* Itemized Table */}
        <div className="py-2.5 border-b border-dashed border-[#A0AEC0]">
          <div className="flex justify-between font-bold text-[10px] text-[#718096] uppercase pb-1 border-b border-[#EDF2F7]">
            <span className="flex-1">ITEM</span>
            <span className="w-10 text-center">QTY</span>
            <span className="w-14 text-right">AMT</span>
          </div>

          <div className="space-y-1.5 pt-1.5">
            {(order.items || []).map((it, idx) => (
              <div key={idx} className="text-[11px] leading-tight">
                <div className="flex justify-between items-start">
                  <span className="flex-1 font-semibold text-[#1A202C]">{it.name}</span>
                  <span className="w-10 text-center font-bold">{it.quantity || 1}</span>
                  <span className="w-14 text-right font-bold">₹{it.totalPrice ?? (it.unitPrice * (it.quantity || 1))}</span>
                </div>
                {it.modifiers && it.modifiers.length > 0 && (
                  <div className="text-[9px] text-[#718096] pl-2 pt-0.5 space-y-0.2">
                    {it.modifiers.map((m, mIdx) => (
                      <div key={mIdx}>+ {m.optionName} {m.priceDelta > 0 ? `(+₹${m.priceDelta})` : ''}</div>
                    ))}
                  </div>
                )}
                {it.specialInstructions && (
                  <div className="text-[9px] text-amber-700 pl-2 font-medium">
                    Note: {it.specialInstructions}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Subtotal, Discounts, GST Tax Breakdown & Round Off */}
        <div className="py-2.5 border-b border-dashed border-[#A0AEC0] space-y-1 text-[11px]">
          <div className="flex justify-between text-[#4A5568]">
            <span>Subtotal</span>
            <span className="font-semibold">₹{order.subtotal ?? 0}</span>
          </div>

          {(order.discountAmount || 0) > 0 && (
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span className="truncate max-w-[200px]">
                Discount
                {order.discountReason
                  ? ` (${order.discountReason})`
                  : order.couponCode
                  ? ` (${order.couponCode})`
                  : ''}
              </span>
              <span>-₹{order.discountAmount}</span>
            </div>
          )}

          <div className="flex justify-between text-[#718096] text-[10px]">
            <span>CGST (2.5%)</span>
            <span>₹{(order.cgstAmount ?? splitTax(order.taxAmount || 0).cgst).toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-[#718096] text-[10px]">
            <span>SGST (2.5%)</span>
            <span>₹{(order.sgstAmount ?? splitTax(order.taxAmount || 0).sgst).toFixed(2)}</span>
          </div>

          {order.roundOffAmount !== undefined && order.roundOffAmount !== 0 && (
            <div className="flex justify-between text-[#718096] text-[10px]">
              <span>Round Off</span>
              <span>{order.roundOffAmount > 0 ? `+₹${order.roundOffAmount.toFixed(2)}` : `-₹${Math.abs(order.roundOffAmount).toFixed(2)}`}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-black pt-1.5 border-t-2 border-[#1A202C] text-[#0B253A]">
            <span>TOTAL</span>
            <span className="text-base">₹{order.totalAmount ?? 0}</span>
          </div>
        </div>

        {/* Payment Confirmation */}
        <div className="py-2 border-b border-dashed border-[#A0AEC0] flex justify-between items-center text-[11px]">
          <span className="font-bold text-[#4A5568]">PAID VIA:</span>
          <span className="font-black text-emerald-800 uppercase bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            {order.paymentMethod}
          </span>
        </div>

        {/* Footer with Optional QR and Brand Credits */}
        <div className="text-center pt-3 text-[10px] space-y-1.5 text-[#718096]">
          <div className="font-bold text-[#2D3748]">{thankYouMessage}</div>
          <div>{footerMessage}</div>

          {showQrCode && (
            <div className="py-1 flex flex-col items-center">
              <div className="w-16 h-16 bg-[#FAF7F2] border border-[#E2E8F0] rounded-lg p-1 flex items-center justify-center">
                <QrCode className="w-full h-full text-[#0B253A]" />
              </div>
              <span className="text-[8px] text-[#A0AEC0] mt-0.5">Scan for E-Bill & Feedback</span>
            </div>
          )}

          <div className="pt-1 border-t border-slate-100">
            <span className="text-[9px] font-black text-[#0B253A] tracking-wider">
              Powered by JAMANVAAR
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Isolated browser printer function that prints ONLY the 80mm/58mm thermal slip
 * inside a sandboxed iframe without printing the main page background, dashboards or modals.
 */
export function printThermalReceipt(
  order: Order,
  paperWidth: '80mm' | '58mm' = '80mm',
  config?: Partial<ReceiptConfig>
): void {
  if (typeof window === 'undefined') return;

  const is80mm = paperWidth === '80mm';
  const restaurantName = config?.restaurantName || '';
  const address = config?.address || '';
  const phone = config?.phone || '';
  const gstin = config?.gstin || '';
  const fssaiNumber = config?.fssaiNumber || '';
  const thankYouMessage = config?.thankYouMessage || 'Thank you for dining with us!';
  const footerMessage = config?.footerMessage || 'Visit again.';

  const itemsHtml = (order.items || []).map((it) => `
    <tr style="border-bottom: 1px dotted #ccc;">
      <td style="padding: 4px 0; font-weight: bold;">${it.name}${it.specialInstructions ? `<br/><span style="font-size: 9px; color: #666;">(${it.specialInstructions})</span>` : ''}</td>
      <td style="padding: 4px 0; text-align: center;">${it.quantity}</td>
      <td style="padding: 4px 0; text-align: right;">₹${it.unitPrice.toFixed(2)}</td>
      <td style="padding: 4px 0; text-align: right; font-weight: bold;">₹${it.totalPrice.toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title></title>
        <style>
          @page {
            size: ${paperWidth} auto;
            margin: 0 !important;
          }
          @media print {
            @page {
              size: ${paperWidth} auto;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 4px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            header, footer, nav {
              display: none !important;
            }
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${is80mm ? '12px' : '10px'};
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: ${paperWidth};
            max-width: ${paperWidth};
            margin: 0 auto;
            padding: 8px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }
          .double-divider {
            border-top: 2px dashed #000;
            margin: 6px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 4px 0;
            font-size: inherit;
          }
          th {
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            text-align: left;
          }
          .token-badge {
            display: inline-block;
            font-size: 14px;
            font-weight: 900;
            padding: 2px 8px;
            border: 1px solid #000;
            margin: 4px 0;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          ${restaurantName ? `<div style="font-size: 16px; font-weight: 900; letter-spacing: 1px;">${restaurantName}</div>` : ''}
          ${address ? `<div style="font-size: 10px; color: #333;">${address}</div>` : ''}
          ${phone ? `<div style="font-size: 10px;">Phone: ${phone}</div>` : ''}
          ${gstin || fssaiNumber ? `<div style="font-size: 9px;">${[gstin && `GSTIN: ${gstin}`, fssaiNumber && `FSSAI: ${fssaiNumber}`].filter(Boolean).join(' | ')}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div class="text-center">
          <div class="bold" style="font-size: 11px;">TAX INVOICE / CASH RECEIPT</div>
          <div class="token-badge">TOKEN #${order.tokenNumber}</div>
        </div>

        <div class="row"><span>Invoice No:</span><span class="bold">${order.orderNumber}</span></div>
        <div class="row"><span>Date & Time:</span><span>${new Date(order.createdAt).toLocaleDateString()} ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span>Order Type:</span><span class="bold">${order.orderType}${order.tableNumber ? ` (TABLE ${order.tableNumber})` : ''}</span></div>
        ${order.customerName ? `<div class="row"><span>Customer:</span><span>${order.customerName} (${order.customerPhone || ''})</span></div>` : ''}
        ${order.cashierName ? `<div class="row"><span>Cashier:</span><span>${order.cashierName}</span></div>` : order.captainName ? `<div class="row"><span>Captain:</span><span>${order.captainName}</span></div>` : ''}

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th style="width: 45%;">Item</th>
              <th style="width: 15%; text-align: center;">Qty</th>
              <th style="width: 20%; text-align: right;">Rate</th>
              <th style="width: 20%; text-align: right;">Amt</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="row"><span>Subtotal:</span><span>₹${(order.subtotal || 0).toFixed(2)}</span></div>
        ${(order.discountAmount || 0) > 0 ? `<div class="row"><span>Discount:</span><span>-₹${order.discountAmount.toFixed(2)}</span></div>` : ''}
        <div class="row"><span>CGST (2.5%):</span><span>₹${(order.cgstAmount ?? splitTax(order.taxAmount || 0).cgst).toFixed(2)}</span></div>
        <div class="row"><span>SGST (2.5%):</span><span>₹${(order.sgstAmount ?? splitTax(order.taxAmount || 0).sgst).toFixed(2)}</span></div>
        ${(order.roundOffAmount || 0) !== 0 ? `<div class="row"><span>Round Off:</span><span>₹${order.roundOffAmount.toFixed(2)}</span></div>` : ''}

        <div class="double-divider"></div>

        <div class="row" style="font-size: ${is80mm ? '14px' : '12px'}; font-weight: 900;">
          <span>GRAND TOTAL:</span>
          <span>₹${order.totalAmount.toFixed(2)}</span>
        </div>

        <div class="divider"></div>

        <div class="row">
          <span>PAID VIA:</span>
          <span class="bold">${order.paymentMethod || 'PAID'} (${order.paymentStatus || 'SUCCESS'})</span>
        </div>

        <div class="divider"></div>

        <div class="text-center" style="font-size: 10px; margin-top: 6px;">
          <div class="bold">${thankYouMessage}</div>
          <div>${footerMessage}</div>
          <div style="font-size: 8px; margin-top: 6px; color: #555;">Powered by JAMANVAAR</div>
        </div>
      </body>
    </html>
  `;

  // Create an invisible iframe to isolate print strictly to the receipt slip
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  }
}

/**
 * Isolated browser printer function that prints ONLY the 80mm/58mm kitchen KOT ticket
 * inside a sandboxed iframe without printing the main page background, dashboards or modals.
 */
export function printThermalKotTicket(
  kot: KOTRecord,
  paperWidth: '80mm' | '58mm' = '80mm'
): void {
  if (typeof window === 'undefined') return;

  const is80mm = paperWidth === '80mm';
  const itemsHtml = (kot.items || []).map((it) => `
    <tr style="border-bottom: 1px dotted #ccc;">
      <td style="padding: 6px 0; font-size: ${is80mm ? '14px' : '12px'}; font-weight: 900;">
        ${it.name}
        ${it.specialInstructions ? `<br/><span style="font-size: 10px; font-weight: bold; color: #d9534f;">NOTE: ${it.specialInstructions}</span>` : ''}
      </td>
      <td style="padding: 6px 0; text-align: right; font-size: ${is80mm ? '16px' : '14px'}; font-weight: 900;">
        x${it.quantity}
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title></title>
        <style>
          @page {
            size: ${paperWidth} auto;
            margin: 0 !important;
          }
          @media print {
            @page {
              size: ${paperWidth} auto;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 4px !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            header, footer, nav {
              display: none !important;
            }
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${is80mm ? '12px' : '10px'};
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: ${paperWidth};
            max-width: ${paperWidth};
            margin: 0 auto;
            padding: 8px;
          }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; }
          th { border-bottom: 1px dashed #000; padding: 4px 0; text-align: left; }
          .kot-title { font-size: 18px; font-weight: 900; }
          .table-badge { font-size: 16px; font-weight: 900; padding: 2px 6px; border: 2px solid #000; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="kot-title">KITCHEN ORDER TICKET</div>
          <div style="font-size: 11px; font-weight: bold; margin-top: 2px;">STATION: ${kot.station || 'MAIN_KITCHEN'}</div>
        </div>

        <div class="divider"></div>

        <div class="row">
          <span>KOT #: <strong style="font-size: 14px;">${kot.kotNumber || kot.id.slice(-6)}</strong></span>
          <span class="table-badge">TBL: ${kot.tableNumber || 'N/A'}</span>
        </div>
        <div class="row">
          <span>Order #: <strong>${kot.orderNumber || ''}</strong></span>
          <span>Token: <strong>#${kot.tokenNumber || ''}</strong></span>
        </div>
        <div class="row">
          <span>Time: <strong>${new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
          <span>Type: <strong>${kot.orderType || 'DINE_IN'}</strong></span>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th>Item Name</th>
              <th style="text-align: right;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="double-divider"></div>

        <div class="text-center" style="font-size: 10px; margin-top: 4px;">
          <div>JAMANVAAR Restaurant Ecosystem</div>
        </div>
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  }
}

