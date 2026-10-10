import PDFDocument from 'pdfkit';

export interface BackupPdfMeta {
  backupId: string;
  restaurantName: string;
  createdAt: Date;
  sizeBytes: number;
  method: string;
}

const navy = '#0B253A';
const saffron = '#D97706';
const muted = '#5B6360';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/** Renders a column-aligned table. Rows are plain string cells; pdfkit paginates automatically as content runs past the page bottom. */
function table(doc: PDFKit.PDFDocument, columns: Array<{ label: string; width: number }>, rows: string[][]) {
  const left = 50;
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 2, 495, 18).fill(navy);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    let x = left + 4;
    for (const col of columns) {
      doc.text(col.label, x, y + 2, { width: col.width - 4 });
      x += col.width;
    }
    doc.moveDown(1.1);
  };
  drawHeader();
  doc.font('Helvetica').fontSize(8).fillColor(navy);
  let idx = 0;
  for (const row of rows) {
    if (doc.y > 760) {
      doc.addPage();
      drawHeader();
      doc.font('Helvetica').fontSize(8).fillColor(navy);
    }
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(left, y - 2, 495, 15).fill('#F7F5F0').fillColor(navy);
    let x = left + 4;
    for (let c = 0; c < columns.length; c++) {
      doc.text(row[c] ?? '', x, y, { width: columns[c].width - 4, ellipsis: true });
      x += columns[c].width;
    }
    doc.moveDown(0.95);
    idx++;
  }
  doc.moveDown(0.6);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, count: number) {
  if (doc.y > 740) doc.addPage();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(navy).text(`${title} (${count})`);
  doc.strokeColor(saffron).lineWidth(1).moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
  doc.moveDown(0.6);
}

function emptyNote(doc: PDFKit.PDFDocument) {
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(muted).text('None recorded.');
  doc.moveDown(0.6);
}

/**
 * A full, readable PDF rendering of a restaurant backup snapshot (every record listed, not
 * summarized into counts) -- for operators who want a human-readable archive copy alongside
 * the JSON the Restore feature actually reads. Never includes password hashes, PIN hashes or
 * device credentials: the snapshot itself never carries them (see buildRestaurantSnapshot's
 * explicit field selects), so there is nothing to redact here.
 */
export function buildBackupPdfBuffer(snapshot: Record<string, unknown>, meta: BackupPdfMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Cover / header ──────────────────────────────────────────────
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text('JAMANVAAR PLATFORM BACKUP REPORT', { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor(muted).text(meta.restaurantName, { align: 'center' });
    doc.moveDown(0.6);
    doc.strokeColor(saffron).lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica').fontSize(9.5).fillColor(navy);
    doc.text(`Snapshot ID: ${meta.backupId}`);
    doc.text(`Taken: ${meta.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    doc.text(`Method: ${meta.method}    Stored size (compressed): ${formatBytes(meta.sizeBytes)}`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(muted).text(
      'This is a readable copy of the backup for record-keeping. Restoring a restaurant from a backup is still done from the original stored snapshot (Preview restore / Restore, in Super Admin > Backups), not from this PDF.'
    );
    doc.moveDown(1);

    const restaurant = (snapshot.restaurant ?? {}) as Record<string, unknown>;
    sectionTitle(doc, 'Restaurant Record', 1);
    doc.font('Helvetica').fontSize(9).fillColor(navy);
    const restLines: Array<[string, unknown]> = [
      ['Name', restaurant.name], ['City', restaurant.city], ['Status', restaurant.status],
      ['Phone', restaurant.phone], ['Email', restaurant.email], ['Created', restaurant.createdAt]
    ];
    for (const [label, value] of restLines) {
      if (value === undefined || value === null || value === '') continue;
      doc.text(`${label}: ${value instanceof Date ? value.toLocaleString('en-IN') : String(value)}`);
    }
    doc.moveDown(0.8);

    const branches = Array.isArray(snapshot.branches) ? (snapshot.branches as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Branches', branches.length);
    if (branches.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Name', width: 220 }, { label: 'City', width: 140 }, { label: 'Status', width: 135 }
    ], branches.map((b) => [String(b.name ?? ''), String(b.city ?? ''), String(b.status ?? '')]));

    const users = Array.isArray(snapshot.users) ? (snapshot.users as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Staff Accounts', users.length);
    if (users.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Name', width: 150 }, { label: 'Email', width: 160 }, { label: 'Role', width: 95 }, { label: 'Status', width: 90 }
    ], users.map((u) => [String(u.fullName ?? ''), String(u.email ?? ''), String(u.role ?? ''), String(u.status ?? '')]));

    const devices = Array.isArray(snapshot.devices) ? (snapshot.devices as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Registered Devices', devices.length);
    if (devices.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Name', width: 150 }, { label: 'Type', width: 100 }, { label: 'Status', width: 90 }, { label: 'App Version', width: 80 }, { label: 'Last seen', width: 75 }
    ], devices.map((d) => [
      String(d.name ?? 'Unnamed'), String(d.type ?? ''), String(d.status ?? ''), String(d.appVersion ?? '—'),
      d.lastSeenAt ? new Date(d.lastSeenAt as string).toLocaleDateString('en-IN') : 'Never'
    ]));

    const subs = Array.isArray(snapshot.subscriptions) ? (snapshot.subscriptions as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Subscriptions', subs.length);
    if (subs.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Plan', width: 220 }, { label: 'Status', width: 135 }, { label: 'Expires', width: 140 }
    ], subs.map((s) => {
      const plan = (s.plan ?? {}) as Record<string, unknown>;
      return [String(plan.name ?? ''), String(s.status ?? ''), s.expiresAt ? new Date(s.expiresAt as string).toLocaleDateString('en-IN') : '—'];
    }));

    const ents = Array.isArray(snapshot.applicationEntitlements) ? (snapshot.applicationEntitlements as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Application Entitlements', ents.length);
    if (ents.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Application', width: 300 }, { label: 'Enabled', width: 195 }
    ], ents.map((e) => [String(e.appCode ?? ''), e.enabled ? 'Yes' : 'No']));

    const entities = Array.isArray(snapshot.syncedEntities) ? (snapshot.syncedEntities as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Synced Menu / Data Records', entities.length);
    if (entities.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Entity Type', width: 140 }, { label: 'External ID', width: 220 }, { label: 'Sync Version', width: 135 }
    ], entities.map((e) => [String(e.entityType ?? ''), String(e.externalId ?? ''), String(e.syncVersion ?? '')]));

    const orders = Array.isArray(snapshot.syncedOrders) ? (snapshot.syncedOrders as Array<Record<string, unknown>>) : [];
    sectionTitle(doc, 'Synced Orders', orders.length);
    if (orders.length === 0) emptyNote(doc);
    else table(doc, [
      { label: 'Order ID', width: 150 }, { label: 'Type', width: 75 }, { label: 'Status', width: 90 },
      { label: 'Payment', width: 85 }, { label: 'Total (Rs.)', width: 95 }
    ], orders.map((o) => [
      String(o.externalOrderId ?? ''), String(o.orderType ?? ''), String(o.status ?? ''),
      String(o.paymentStatus ?? '—'), (Number(o.totalAmount ?? 0) / 100).toFixed(2)
    ]));

    doc.font('Helvetica').fontSize(7.5).fillColor(muted).text('Generated by JAMANVAAR Platform — Super Admin Backups & Recovery', 50, 790, { width: 495, align: 'center' });

    doc.end();
  });
}
