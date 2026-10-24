import { useKioskDraft } from '../kiosk/useKioskDraft';
import { requestConfigurationReceipts } from '../kiosk/configurationDelivery';
import React, { useState } from 'react';
import { AuditRepository, ReceiptRepository, db } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';
import { formatTime } from '@jamanvaar/utils';
import type { Order, ReceiptConfig } from '@jamanvaar/types';
import { Button, ThermalReceiptView, useConfirm } from '@jamanvaar/ui';
import { syncKioskConfiguration } from '@jamanvaar/sync';
import { retryReceiptWhatsApp } from '../../cloud/cloudClient';
import { getCurrentAdminName } from '../../currentAdminIdentity';

/** What the preview shows before any real order exists — a real order appears once a guest has ordered. */
const SAMPLE_RECEIPT_ORDER = {
  id: 'sample-order',
  orderNumber: 'SAMPLE-0001',
  tokenNumber: '101',
  orderType: 'TAKEAWAY',
  items: [
    { id: 'sample-1', orderId: 'sample-order', menuItemId: 'sample-1', name: 'Sample dish', quantity: 2, unitPrice: 100, modifiers: [], totalPrice: 200 },
    { id: 'sample-2', orderId: 'sample-order', menuItemId: 'sample-2', name: 'Sample drink', quantity: 1, unitPrice: 60, modifiers: [], totalPrice: 60 }
  ],
  subtotal: 260,
  discountAmount: 0,
  cgstAmount: 6.5,
  sgstAmount: 6.5,
  taxAmount: 13,
  roundOffAmount: 0,
  totalAmount: 273,
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  orderStatus: 'CONFIRMED',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
} as unknown as Order;

/**
 * Relocated from kiosk-admin's Receipt & E-Bill Settings tab — genuinely missing from pos-admin
 * (grepped: no thermal paper size, WhatsApp/SMS e-bill toggle, cash watermark, or e-bill audit
 * log anywhere else in this app). Not kiosk-specific: these govern every printed/digital bill
 * this restaurant sends, from POS, Captain or Kiosk alike.
 *
 * Legal/branding fields (restaurant name, GSTIN, FSSAI, address, phone) are deliberately NOT
 * duplicated here — Settings -> Report Branding already owns them and already writes them into
 * this same receiptConfig record on save (see ReportBrandingSettings.tsx), so editing them in a
 * second place here would reintroduce the "third independently-hardcoded GSTIN" bug this
 * codebase already fixed once. They're shown read-only below with a link to go edit them.
 */
export const ReceiptEBillPanel: React.FC<{ showToast: (msg: string) => void; onGoToSettings: () => void }> = ({
  showToast,
  onGoToSettings
}) => {
  const [config, setConfig] = useState<ReceiptConfig>(ReceiptRepository.getConfig());
  const [baseline,setBaseline]=useState(()=>JSON.stringify(ReceiptRepository.getConfig()));
  const draftGuard=useKioskDraft({scope:'receipt',value:config,dirty:JSON.stringify(config)!==baseline,restore:setConfig,discard:()=>setConfig(JSON.parse(baseline))});
  const records = ReceiptRepository.getAllRecords();
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  // #13: this table only ever rendered the same green badge for every status, and a failed send
  // had no way to retry -- the recipient is masked for privacy, so retrying asks for the number
  // again, but reuses the already-known orderId; the order itself is never recreated.
  const { prompt, confirmDialog } = useConfirm();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retrySend = async (rec: ReturnType<typeof ReceiptRepository.getAllRecords>[number]) => {
    const phone = await prompt({
      title: `Retry WhatsApp bill for order ${rec.orderNumber}`,
      message: 'The saved recipient is masked for privacy. Enter the number to resend to.',
      inputLabel: 'WhatsApp number',
      placeholder: '98765 43210',
      required: true
    });
    if (!phone) return;
    setRetryingId(rec.id);
    try {
      const result = await retryReceiptWhatsApp(rec.orderId, phone.trim());
      ReceiptRepository.addRecord({
        id: `rec-retry-${Date.now()}`,
        orderId: rec.orderId,
        orderNumber: rec.orderNumber,
        tokenNumber: rec.tokenNumber,
        deliveryMethod: 'WHATSAPP',
        deliveryStatus: result.success ? 'SENT' : 'FAILED',
        recipient: phone.replace(/\d(?=\d{2})/g, '*'),
        content: rec.content,
        createdAt: new Date().toISOString(),
        ...(result.success ? { sentAt: new Date().toISOString() } : { errorMessage: result.errorMessage || 'WhatsApp send failed' })
      });
      AuditRepository.log({
        action: 'RECEIPT_WHATSAPP_RETRIED',
        category: 'SETTINGS',
        details: `Retried WhatsApp bill for order ${rec.orderNumber}: ${result.success ? 'accepted by provider' : result.errorMessage || 'failed'}`,
        username: getCurrentAdminName()
      });
      showToast(result.success ? 'Bill resent — accepted by WhatsApp provider.' : `Retry failed: ${result.errorMessage || 'WhatsApp send failed'}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not retry this bill.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (publishing) return;
    setPublishing(true); setPublishMessage('');
    // BUG: a changed UPI payout VPA -- the one field on this whole page that actually redirects real
    // money -- was logged under the exact same generic "paper size" message as every other edit here,
    // so even a legitimate change left no distinct trail to audit. Called out explicitly when it
    // happens, with the before/after VPA, same as any other sensitive financial change should be.
    const before = ReceiptRepository.getConfig();
    const upiChanged = (before.upiId ?? '') !== (config.upiId ?? '') || (before.upiPayeeName ?? '') !== (config.upiPayeeName ?? '');
    ReceiptRepository.updateConfig(config);
    AuditRepository.log({
      username: getCurrentAdminName(),
      action: upiChanged ? 'RECEIPT_UPI_PAYOUT_CHANGED' : 'RECEIPT_SETTINGS_UPDATED',
      category: 'SETTINGS',
      details: upiChanged
        ? `UPI payout VPA changed from "${before.upiId || '(none)'}" to "${config.upiId || '(none)'}" (payee name: "${config.upiPayeeName || before.restaurantName || ''}")`
        : `Updated thermal receipt template and paper size to ${config.paperSize}`
    });
    try {
      await syncKioskConfiguration({ push: true });
      setPublishMessage(await requestConfigurationReceipts());
      setBaseline(JSON.stringify(config));draftGuard.clear();
      showToast('Receipt settings saved and published.');
    } catch (error) { setPublishMessage(error instanceof Error ? error.message : 'Receipt settings saved locally. Publication failed; retry when connected.'); }
    finally { setPublishing(false); }
  };

  return (
    <div className="space-y-6">{draftGuard.ui}{confirmDialog}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-jaman-navy">Receipt & E-Bill System</h1>
        <p className="text-sm text-[#4A5568] mt-1">
          Configure thermal paper dimensions (58mm vs 80mm), WhatsApp digital receipt templates, and audit history.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
          <form onSubmit={handleSave} className="space-y-4">
            {publishMessage && <p role="status" className="text-sm">{publishMessage}</p>}
            <div className="p-3 bg-jaman-ivory border border-jaman-border rounded-xl text-[11px] text-[#4A5568] flex items-center justify-between gap-3">
              <span>
                Restaurant name, GSTIN, FSSAI and address print from <strong>Settings → Report Branding</strong>.
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={onGoToSettings}>
                Go to Settings
              </Button>
            </div>

            <h3 className="font-bold text-base text-jaman-navy pt-1">Thank You & Footer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rcpt-field-1" className="block text-xs font-bold text-jaman-navy mb-1">Thank You Closing Message</label>
                <input id="rcpt-field-1"
                  type="text"
                  value={config.thankYouMessage}
                  onChange={(e) => setConfig({ ...config, thankYouMessage: e.target.value })}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
              <div>
                <label htmlFor="rcpt-field-2" className="block text-xs font-bold text-jaman-navy mb-1">Footer Heritage Tagline</label>
                <input id="rcpt-field-2"
                  type="text"
                  value={config.footerMessage}
                  onChange={(e) => setConfig({ ...config, footerMessage: e.target.value })}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
            </div>

            <h3 className="font-bold text-base text-jaman-navy pt-3 border-t border-[#F3EFE6]">UPI Payment QR</h3>
            <p className="text-[11px] text-[#4A5568] -mt-2">
              When set, every receipt shows a "Scan to pay" QR for the exact bill total — any UPI app (GPay, PhonePe,
              Paytm...) opens pre-filled, ready to confirm. Pays straight into this UPI ID, no gateway involved.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div id="settings-upi-vpa">
                <label htmlFor="rcpt-field-3" className="block text-xs font-bold text-jaman-navy mb-1">Restaurant UPI ID (VPA)</label>
                <input id="rcpt-field-3"
                  type="text"
                  value={config.upiId || ''}
                  onChange={(e) => setConfig({ ...config, upiId: e.target.value.trim() })}
                  placeholder="restaurant@upi"
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
              <div>
                <label htmlFor="rcpt-field-4" className="block text-xs font-bold text-jaman-navy mb-1">Payee Name Shown in UPI App</label>
                <input id="rcpt-field-4"
                  type="text"
                  value={config.upiPayeeName || ''}
                  onChange={(e) => setConfig({ ...config, upiPayeeName: e.target.value })}
                  placeholder={config.restaurantName || 'Restaurant name'}
                  className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-jaman-navy cursor-pointer">
              <input
                type="checkbox"
                checked={config.showUpiQrOnReceipt === true}
                disabled={!config.upiId?.trim()}
                onChange={(e) => setConfig({ ...config, showUpiQrOnReceipt: e.target.checked })}
                className="rounded text-brand"
              />
              <span>
                Show UPI payment QR on receipts
                {!config.upiId?.trim() && <span className="font-normal text-slate-500"> (enter a UPI ID above first)</span>}
              </span>
            </label>

            <h3 id="settings-receipt-logo" className="font-bold text-base text-jaman-navy pt-3 border-t border-[#F3EFE6]">Logo</h3>
            <p className="text-[11px] text-[#4A5568] -mt-2">
              Shown on the on-screen and WhatsApp receipt and printed at the top of the physical slip.
            </p>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Receipt Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-jaman-border bg-jaman-ivory flex items-center justify-center overflow-hidden shrink-0">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="Receipt logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-[#64748B] text-center px-1">No logo</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div
                    className="border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer border-[#D4CBBF] bg-jaman-ivory hover:border-brand hover:bg-brand/[0.07]/30 transition-colors"
                    onClick={() => document.getElementById('receipt-logo-upload-input')?.click()}
                  >
                    <input
                      id="receipt-logo-upload-input"
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          showToast('Please select a logo image smaller than 2MB');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => setConfig({ ...config, logoUrl: ev.target?.result as string });
                        reader.readAsDataURL(file);
                      }}
                    />
                    <span className="text-[11px] font-bold text-jaman-navy">Click to upload a logo (PNG/JPG, under 2MB)</span>
                  </div>
                  <input
                    type="url"
                    aria-label="Logo image URL"
                    value={config.logoUrl?.startsWith('data:') ? '' : config.logoUrl || ''}
                    onChange={(e) => setConfig({ ...config, logoUrl: e.target.value || undefined })}
                    placeholder="...or paste a logo image URL"
                    className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>
              </div>
            </div>

            <h3 className="font-bold text-base text-jaman-navy pt-3 border-t border-[#F3EFE6]">Paper Dimension & Display Rules</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, paperSize: '80mm' })}
                className={`p-3 rounded-xl border text-center font-bold text-xs ${
                  config.paperSize === '80mm' ? 'bg-brand/[0.09] text-brand border-brand/40 font-semibold' : 'bg-jaman-ivory border-jaman-border text-jaman-navy'
                }`}
              >
                80mm Standard POS
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, paperSize: '58mm' })}
                className={`p-3 rounded-xl border text-center font-bold text-xs ${
                  config.paperSize === '58mm' ? 'bg-brand/[0.09] text-brand border-brand/40 font-semibold' : 'bg-jaman-ivory border-jaman-border text-jaman-navy'
                }`}
              >
                58mm Compact POS
              </button>
              <label className="flex items-center gap-2 p-3 bg-jaman-ivory border border-jaman-border rounded-xl text-xs font-semibold text-jaman-navy cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showTaxBreakup}
                  onChange={(e) => setConfig({ ...config, showTaxBreakup: e.target.checked })}
                  className="rounded text-brand"
                />
                Tax Breakup (GST)
              </label>
              <label className="flex items-center gap-2 p-3 bg-jaman-ivory border border-jaman-border rounded-xl text-xs font-semibold text-jaman-navy cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableEmail}
                  onChange={(e) => setConfig({ ...config, enableEmail: e.target.checked })}
                  className="rounded text-brand"
                />
                Email Bill (PDF)
              </label>
            </div>

            <div id="settings-cash-payment" className="p-4 bg-jaman-ivory border border-jaman-border rounded-2xl space-y-3">
              <label className="flex items-start gap-2 text-xs font-semibold text-jaman-navy cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showCashWatermark === true}
                  onChange={(e) => setConfig({ ...config, showCashWatermark: e.target.checked })}
                  className="rounded text-brand mt-0.5"
                />
                <span>
                  Mark cash bills with a faint diagonal watermark (off by default)
                  <span className="block font-normal text-slate-500 mt-0.5">
                    Bills paid by cash at the counter show the word across the slip in four slanted lines, faint enough to read the
                    bill through it. Card and UPI bills stay plain.
                  </span>
                </span>
              </label>
              {config.showCashWatermark === true && (
                <div className="max-w-xs">
                  <label htmlFor="rcpt-watermark" className="block text-[11px] font-bold text-jaman-navy mb-1">Watermark word</label>
                  <input id="rcpt-watermark"
                    value={config.cashWatermarkText ?? ''}
                    onChange={(e) => setConfig({ ...config, cashWatermarkText: e.target.value.slice(0, 12) })}
                    placeholder="CASH"
                    maxLength={12}
                    className="w-full bg-white border border-jaman-border rounded-xl px-3 py-1.5 text-xs font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-jaman-navy"
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#F3EFE6] flex justify-end">
              <Button variant="accent" type="submit" disabled={publishing}>
                {publishing ? 'Publishing receipt settings…' : 'Save Receipt Settings'}
              </Button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm flex flex-col items-center justify-between">
          <div className="w-full">
            <h3 className="font-bold text-sm text-jaman-navy mb-3 text-center">Live Receipt Preview ({config.paperSize})</h3>
            <div className="flex flex-col items-center">
              {db.orders.length === 0 && (
                <p className="mb-3 w-full text-center text-[11px] font-semibold text-slate-500">
                  Sample receipt: a real order appears here once a guest has ordered.
                </p>
              )}
              <ThermalReceiptView
                order={db.orders[0] ?? SAMPLE_RECEIPT_ORDER}
                config={config}
                onPrint={async () => {
                  const res = await PrinterService.printTestSlip();
                  showToast(res.message);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-jaman-border overflow-hidden shadow-sm">
        <div className="p-4 bg-jaman-ivory border-b border-jaman-border font-bold text-sm text-jaman-navy flex items-center justify-between">
          <span>Digital E-Bill Transmission Audit Log</span>
          <span className="text-xs text-[#64748B] font-normal">{records.length} records</span>
        </div>

        {records.length === 0 ? (
          <p className="text-xs text-[#64748B] p-6 text-center">
            No digital receipts dispatched yet. Dispatched WhatsApp & SMS e-bills will appear here with masked privacy numbers.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F6F0] border-b border-jaman-border text-[#64748B] uppercase font-bold">
                <tr>
                  <th className="py-3 px-4">Order / Token</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Recipient (Masked)</th>
                  <th className="py-3 px-4">Sent Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EFE6]">
                {records.map((rec) => {
                  const statusStyle = rec.deliveryStatus === 'SENT'
                    ? 'bg-emerald-50 text-emerald-700'
                    : rec.deliveryStatus === 'FAILED'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700';
                  // "SENT" here only ever means the WhatsApp provider accepted the send request --
                  // there is no delivery-receipt webhook wired up, so it is never relabelled "Delivered".
                  const statusLabel = rec.deliveryStatus === 'SENT' ? 'Provider accepted' : rec.deliveryStatus;
                  return (
                    <tr key={rec.id} className="hover:bg-jaman-ivory">
                      <td className="py-3 px-4 font-bold text-jaman-navy">
                        {rec.orderNumber} (#{rec.tokenNumber})
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand">{rec.deliveryMethod}</td>
                      <td className="py-3 px-4 font-mono font-bold text-jaman-navy">{rec.recipient}</td>
                      <td className="py-3 px-4 text-[#64748B]">{formatTime(rec.createdAt)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${statusStyle}`} title={rec.errorMessage}>{statusLabel}</span>
                      </td>
                      <td className="py-3 px-4">
                        {rec.deliveryStatus === 'FAILED' && rec.deliveryMethod === 'WHATSAPP' && (
                          <button
                            type="button"
                            disabled={retryingId === rec.id}
                            onClick={() => void retrySend(rec)}
                            className="text-[11px] font-bold text-brand underline disabled:opacity-50"
                          >
                            {retryingId === rec.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
