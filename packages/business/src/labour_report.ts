import type { AttendanceRecord, StaffShiftSchedule } from '@jamanvaar/types';

export interface LabourRow {
  userId: string;
  name: string;
  daysWorked: number;
  hours: number;
  /** Rupees per hour, or undefined when no rate has been entered for this person. */
  rate?: number;
  cost: number;
  scheduledHours: number;
  lateDays: number;
  absentDays: number;
  /** Days with a clock-in and no clock-out that were not counted from the clock (a forgotten clock-out). */
  missingClockOut: number;
}

export interface LabourReport {
  rows: LabourRow[];
  totalHours: number;
  totalCost: number;
  /** Labour cost as a share of sales, 0 to 100. Absent when there were no sales in the period. */
  labourPercentOfSales?: number;
  salesPerLabourHour?: number;
  /** Staff who worked but have no hourly rate, so their cost is missing from the total. */
  missingRate: string[];
}

export interface LabourInput {
  attendance: AttendanceRecord[];
  schedules: StaffShiftSchedule[];
  /** userId -> rupees per hour. */
  payRates: Record<string, number>;
  /** YYYY-MM-DD, inclusive. */
  fromDate: string;
  toDate: string;
  sales: number;
  now: Date;
  todayKey: string;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** Nobody works this long in one clock-in; a longer gap means the clock-out was forgotten and the day is treated as unknown. */
const MAX_SHIFT_HOURS = 16;

function minutesBetween(startHm: string, endHm: string): number {
  const [sh, sm] = startHm.split(':').map(Number);
  const [eh, em] = endHm.split(':').map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m < 0) m += 24 * 60; // a shift that runs past midnight
  return m;
}

/** Hours worked come from the clock. A person still clocked in today is counted up to now. A day with no clock-out is not guessed. */
export function buildLabourReport(input: LabourInput): LabourReport {
  const { attendance, schedules, payRates, fromDate, toDate, sales, now, todayKey } = input;
  const rows = new Map<string, LabourRow>();
  const row = (userId: string, name: string): LabourRow => {
    let r = rows.get(userId);
    if (!r) rows.set(userId, (r = { userId, name, daysWorked: 0, hours: 0, rate: payRates[userId], cost: 0, scheduledHours: 0, lateDays: 0, absentDays: 0, missingClockOut: 0 }));
    return r;
  };

  for (const a of attendance) {
    if (a.date < fromDate || a.date > toDate) continue;
    const r = row(a.userId, a.userName);
    if (a.status === 'ABSENT') { r.absentDays += 1; continue; }
    if (a.status === 'ON_LEAVE') continue;
    if (a.status === 'LATE') r.lateDays += 1;
    if (!a.clockInAt) continue;
    const start = new Date(a.clockInAt).getTime();
    const stillIn = !a.clockOutAt && a.date === todayKey;
    const end = a.clockOutAt ? new Date(a.clockOutAt).getTime() : stillIn ? now.getTime() : NaN;
    const hours = (end - start) / 3_600_000;
    if (!Number.isFinite(hours) || hours < 0 || hours > MAX_SHIFT_HOURS) {
      if (!a.clockOutAt) r.missingClockOut += 1;
      continue;
    }
    r.daysWorked += 1;
    r.hours = round2(r.hours + hours);
  }

  for (const s of schedules) {
    if (s.date < fromDate || s.date > toDate) continue;
    row(s.userId, s.userName).scheduledHours = round2(row(s.userId, s.userName).scheduledHours + minutesBetween(s.startTime, s.endTime) / 60);
  }

  for (const r of rows.values()) r.cost = r.rate ? round2(r.hours * r.rate) : 0;

  const list = [...rows.values()].sort((a, b) => b.cost - a.cost || b.hours - a.hours);
  const totalHours = round2(list.reduce((s, r) => s + r.hours, 0));
  const totalCost = round2(list.reduce((s, r) => s + r.cost, 0));
  return {
    rows: list,
    totalHours,
    totalCost,
    ...(sales > 0 && totalCost > 0 ? { labourPercentOfSales: round2((totalCost / sales) * 100) } : {}),
    ...(sales > 0 && totalHours > 0 ? { salesPerLabourHour: round2(sales / totalHours) } : {}),
    missingRate: list.filter((r) => r.hours > 0 && !r.rate).map((r) => r.name)
  };
}
