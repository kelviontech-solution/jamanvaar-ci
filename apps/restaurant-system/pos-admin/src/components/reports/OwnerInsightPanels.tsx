import React, { useMemo, useState } from 'react';
import { db, StaffScheduleRepository } from '@jamanvaar/database';
import {
  buildDailySummaryMessage, buildLabourReport, buildLossReport, buildPrepTimeReport, whatsappShareLink,
  type LossEntry
} from '@jamanvaar/business';
import { copyText, formatINR, formatRestaurantDate } from '@jamanvaar/utils';
import { AlertTriangle, Copy, MessageCircle } from 'lucide-react';
import type { ReportDateRange, ReportSummaryMetrics, DishPerformanceRow } from './reportDataEngine';

const cell = 'p-3';
const headRow = 'bg-jaman-cream border-b border-jaman-border text-slate-500 font-bold uppercase text-[10px]';
const card = 'bg-white border border-jaman-border rounded-3xl p-5 shadow-xs space-y-4';

/** The voided bills' reasons and who voided them, read from the audit trail (the bill itself keeps neither). */
function voidNotes(): Map<string, { reason: string; by: string }> {
  const notes = new Map<string, { reason: string; by: string }>();
  for (const log of db.auditLogs ?? []) {
    if (log.action !== 'ORDER_CANCELLED') continue;
    const m = /^Voided Order #(.+?) - Reason: (.*)$/.exec(log.details ?? '');
    if (m) notes.set(m[1], { reason: m[2] || 'No reason recorded', by: log.username || 'Manager' });
  }
  return notes;
}

const KIND_LABEL: Record<LossEntry['kind'], string> = {
  DISH_CANCELLED: 'Cancelled dish',
  ORDER_VOIDED: 'Voided bill',
  DISCOUNT: 'Discount',
  REFUND: 'Refund'
};

export function useLossReport(range: ReportDateRange) {
  return useMemo(
    () => buildLossReport({ orders: db.orders ?? [], from: range.startDate, to: range.endDate, voids: voidNotes() }),
    // db.orders is a live list; the dashboard re-renders on every change, so read it each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate.getTime(), range.endDate.getTime(), (db.orders ?? []).length, (db.auditLogs ?? []).length]
  );
}

export const LossReportPanel: React.FC<{ range: ReportDateRange }> = ({ range }) => {
  const report = useLossReport(range);
  const t = report.totals;
  const tiles: Array<[string, number]> = [
    ['Cancelled dishes', t.cancelledDishes],
    ['Voided bills', t.voidedOrders],
    ['Discounts given', t.discounts],
    ['Refunds', t.refunds]
  ];
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-extrabold text-sm text-jaman-navy">Money not collected, and who was behind it</h3>
        <span className="text-xs font-mono font-black text-rose-700">{formatINR(t.all)}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="p-3 rounded-2xl bg-jaman-cream border border-jaman-border">
            <span className="text-[10px] font-black uppercase text-slate-500 block">{label}</span>
            <div className="text-lg font-mono font-black text-jaman-navy mt-1">{formatINR(value)}</div>
          </div>
        ))}
      </div>

      {report.watch.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-900"><AlertTriangle className="w-3.5 h-3.5" /> Worth a look</div>
          {report.watch.map((w) => <p key={w} className="text-xs text-amber-900">{w}</p>)}
        </div>
      )}

      {report.entries.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No cancellations, voids, discounts or refunds in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="overflow-x-auto rounded-2xl border border-jaman-border">
              <table className="w-full text-left text-xs">
                <thead className={headRow}><tr><th className={cell}>Staff</th><th className={cell}>Cancelled</th><th className={cell}>Discounts</th><th className={cell}>Refunds</th><th className={cell}>Total</th></tr></thead>
                <tbody>
                  {report.byStaff.map((s) => (
                    <tr key={s.name} className="border-b border-slate-100 last:border-0">
                      <td className={`${cell} font-bold text-jaman-navy`}>{s.name}</td>
                      <td className={`${cell} font-mono`}>{s.cancelledCount} · {formatINR(s.cancelledValue)}</td>
                      <td className={`${cell} font-mono`}>{s.discountCount} · {formatINR(s.discountValue)}</td>
                      <td className={`${cell} font-mono`}>{formatINR(s.refundValue)}</td>
                      <td className={`${cell} font-mono font-black`}>{formatINR(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-jaman-border">
              <table className="w-full text-left text-xs">
                <thead className={headRow}><tr><th className={cell}>Reason for cancelling</th><th className={cell}>Times</th><th className={cell}>Value</th></tr></thead>
                <tbody>
                  {report.byReason.length === 0 && <tr><td className={`${cell} text-slate-400`} colSpan={3}>No cancellations.</td></tr>}
                  {report.byReason.map((r) => (
                    <tr key={r.reason} className="border-b border-slate-100 last:border-0">
                      <td className={cell}>{r.reason}</td><td className={`${cell} font-mono`}>{r.count}</td><td className={`${cell} font-mono font-black`}>{formatINR(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-jaman-border">
            <table className="w-full text-left text-xs">
              <thead className={headRow}><tr><th className={cell}>Time</th><th className={cell}>What</th><th className={cell}>Order</th><th className={cell}>Reason</th><th className={cell}>By</th><th className={cell}>Amount</th></tr></thead>
              <tbody>
                {report.entries.slice(0, 200).map((e, i) => (
                  <tr key={`${e.orderId}-${e.kind}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className={`${cell} font-mono whitespace-nowrap`}>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className={cell}><span className="font-bold text-jaman-navy">{KIND_LABEL[e.kind]}</span>{e.label && <span className="text-slate-500"> · {e.label}</span>}</td>
                    <td className={`${cell} font-mono`}>#{e.orderNumber}{e.tableNumber ? ` · T${e.tableNumber}` : ''}</td>
                    <td className={cell}>{e.reason}</td>
                    <td className={cell}>{e.by}</td>
                    <td className={`${cell} font-mono font-black text-rose-700`}>{formatINR(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export const PrepTimePanel: React.FC<{ range: ReportDateRange }> = ({ range }) => {
  const report = useMemo(
    () => buildPrepTimeReport({
      orders: db.orders ?? [], from: range.startDate, to: range.endDate,
      targetOf: (id) => db.menuItems.find((m) => m.id === id)?.prepTimeMinutes,
      stationOf: (id) => db.menuItems.find((m) => m.id === id)?.kitchenStation
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate.getTime(), range.endDate.getTime(), (db.orders ?? []).length, (db.orders ?? []).filter((o) => o.items?.some((i) => i.readyAt)).length]
  );
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-extrabold text-sm text-jaman-navy">How long each dish takes</h3>
        <span className="text-xs text-slate-400 font-mono">{report.measured} portions timed</span>
      </div>
      {report.dishes.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No timed dishes yet. Times appear once the kitchen marks dishes done on the kitchen screen.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-jaman-border">
          <table className="w-full text-left text-xs">
            <thead className={headRow}><tr><th className={cell}>Dish</th><th className={cell}>Station</th><th className={cell}>Portions</th><th className={cell}>Average</th><th className={cell}>9 in 10 within</th><th className={cell}>Slowest</th><th className={cell}>Target</th><th className={cell}>On time</th></tr></thead>
            <tbody>
              {report.dishes.map((d) => {
                const slow = d.targetMinutes !== undefined && d.avgMinutes > d.targetMinutes;
                return (
                  <tr key={d.menuItemId} className="border-b border-slate-100 last:border-0">
                    <td className={`${cell} font-bold text-jaman-navy`}>{d.name}</td>
                    <td className={cell}>{d.station}</td>
                    <td className={`${cell} font-mono`}>{d.portions}</td>
                    <td className={`${cell} font-mono font-black ${slow ? 'text-rose-700' : ''}`}>{d.avgMinutes} min</td>
                    <td className={`${cell} font-mono`}>{d.p90Minutes} min</td>
                    <td className={`${cell} font-mono`}>{d.slowestMinutes} min</td>
                    <td className={`${cell} font-mono`}>{d.targetMinutes !== undefined ? `${d.targetMinutes} min` : '-'}</td>
                    <td className={`${cell} font-mono`}>{d.onTimePercent !== undefined ? `${d.onTimePercent}%` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {report.stations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {report.stations.map((s) => (
            <div key={s.station} className="p-3 rounded-2xl bg-jaman-cream border border-jaman-border">
              <span className="text-[10px] font-black uppercase text-slate-500 block">{s.station}</span>
              <div className="text-sm font-mono font-black text-jaman-navy mt-1">{s.avgMinutes} min avg</div>
              <div className="text-[11px] text-slate-500">{s.portions} portions · 9 in 10 within {s.p90Minutes} min</div>
            </div>
          ))}
        </div>
      )}
      {report.unmeasured > 0 && <p className="text-[11px] text-slate-400">{report.unmeasured} portions were left out: no done-time was recorded, or the ticket stayed open for hours.</p>}
    </div>
  );
};

export const LabourPanel: React.FC<{ range: ReportDateRange; sales: number }> = ({ range, sales }) => {
  const key = (d: Date) => formatRestaurantDate(d, 'ISO_DATE');
  const report = useMemo(
    () => buildLabourReport({
      attendance: db.attendanceRecords ?? [], schedules: db.staffSchedules ?? [], payRates: StaffScheduleRepository.getPayRates(),
      fromDate: key(range.startDate), toDate: key(range.endDate), sales, now: new Date(), todayKey: key(new Date())
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate.getTime(), range.endDate.getTime(), sales, (db.attendanceRecords ?? []).length, JSON.stringify(db.staffPayRates)]
  );
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-extrabold text-sm text-jaman-navy">Staff hours and labour cost</h3>
        <span className="text-xs text-slate-400 font-mono">{report.rows.length} people</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Hours worked" value={`${report.totalHours} h`} />
        <Tile label="Labour cost" value={formatINR(report.totalCost)} />
        <Tile label="Labour as share of sales" value={report.labourPercentOfSales !== undefined ? `${report.labourPercentOfSales}%` : '-'} />
        <Tile label="Sales per labour hour" value={report.salesPerLabourHour !== undefined ? formatINR(report.salesPerLabourHour) : '-'} />
      </div>
      {report.missingRate.length > 0 && (
        <p className="text-xs rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 p-3">
          No hourly pay is set for {report.missingRate.join(', ')}, so their cost is not in the total. Set it under Staff, Edit Employee.
        </p>
      )}
      {report.rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No clock-ins in this period. Staff clock in and out under Staff and Roles.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-jaman-border">
          <table className="w-full text-left text-xs">
            <thead className={headRow}><tr><th className={cell}>Person</th><th className={cell}>Days</th><th className={cell}>Hours</th><th className={cell}>Planned</th><th className={cell}>Rate</th><th className={cell}>Cost</th><th className={cell}>Late</th><th className={cell}>Absent</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.userId} className="border-b border-slate-100 last:border-0">
                  <td className={`${cell} font-bold text-jaman-navy`}>{r.name}{r.missingClockOut > 0 && <span className="ml-2 text-[10px] font-bold text-amber-700">{r.missingClockOut} day{r.missingClockOut === 1 ? '' : 's'} with no clock-out</span>}</td>
                  <td className={`${cell} font-mono`}>{r.daysWorked}</td>
                  <td className={`${cell} font-mono`}>{r.hours}</td>
                  <td className={`${cell} font-mono`}>{r.scheduledHours || '-'}</td>
                  <td className={`${cell} font-mono`}>{r.rate ? formatINR(r.rate) : '-'}</td>
                  <td className={`${cell} font-mono font-black`}>{r.rate ? formatINR(r.cost) : '-'}</td>
                  <td className={`${cell} font-mono`}>{r.lateDays}</td>
                  <td className={`${cell} font-mono`}>{r.absentDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-3 rounded-2xl bg-jaman-cream border border-jaman-border">
    <span className="text-[10px] font-black uppercase text-slate-500 block">{label}</span>
    <div className="text-lg font-mono font-black text-jaman-navy mt-1">{value}</div>
  </div>
);

const PHONE_KEY = 'jamanvaar_owner_whatsapp_number';

export const OwnerSummaryPanel: React.FC<{ range: ReportDateRange; summary: ReportSummaryMetrics; dishes: DishPerformanceRow[]; showToast: (m: string) => void }> = ({ range, summary, dishes, showToast }) => {
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } });
  const losses = useLossReport(range);
  const message = buildDailySummaryMessage({
    restaurantName: db.restaurant.name,
    dateLabel: range.label,
    orders: summary.ordersCount.current,
    sales: summary.netSales.current,
    cash: summary.cashCollected.current,
    upi: summary.upiCollected.current,
    card: summary.cardCollected.current,
    other: summary.splitCollected.current + summary.otherCollected.current,
    guests: summary.totalGuests.current || undefined,
    topDishes: [...dishes].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 3).map((d) => ({ name: d.name, quantity: d.quantitySold })),
    losses
  });
  const remember = (v: string) => { setPhone(v); try { localStorage.setItem(PHONE_KEY, v); } catch { /* remembered only for this session */ } };
  return (
    <div className={card}>
      <div className="border-b border-slate-100 pb-3">
        <h3 className="font-extrabold text-sm text-jaman-navy">Owner summary message</h3>
        <p className="text-xs text-slate-500 mt-0.5">The day in a few lines. Send it to your own WhatsApp with one tap. This opens WhatsApp on this computer or phone; no account or key is needed.</p>
      </div>
      <pre className="whitespace-pre-wrap text-xs font-mono bg-jaman-cream border border-jaman-border rounded-2xl p-4 text-jaman-navy">{message}</pre>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <label className="flex-1 text-xs font-bold text-slate-600">
          Owner's WhatsApp number (with country code)
          <input
            value={phone}
            onChange={(e) => remember(e.target.value)}
            inputMode="tel"
            placeholder="+91 98765 43210"
            className="mt-1 w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-jaman-saffron"
          />
        </label>
        <a
          href={whatsappShareLink(message, phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <MessageCircle className="w-4 h-4" /> Send on WhatsApp
        </a>
        <button
          type="button"
          onClick={async () => showToast((await copyText(message)) ? 'Summary copied' : 'Could not copy')}
          className="px-4 py-2 rounded-xl border border-jaman-border bg-white hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Copy className="w-4 h-4" /> Copy
        </button>
      </div>
    </div>
  );
};
