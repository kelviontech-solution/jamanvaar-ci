const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5178;
const HOST = '0.0.0.0';
const DB_FILE = path.join(__dirname, '../../packages/database/src/live_db.json');

// In-Memory Database State
let dbState = {
  orders: [],
  idempotencyMap: {},
  kioskHeartbeats: {},
  auditLogs: [],
  receiptRecords: [],
  tables: [],
  menuItems: []
};

// SSE Connected Clients (Admins, KDS, POS, Kiosks)
let sseClients = [];

// Load persisted DB if exists
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    dbState = { ...dbState, ...parsed };
    if (!dbState.idempotencyMap) dbState.idempotencyMap = {};
    if (!dbState.kioskHeartbeats) dbState.kioskHeartbeats = {};
    if (!Array.isArray(dbState.orders)) dbState.orders = [];
    if (!Array.isArray(dbState.auditLogs)) dbState.auditLogs = [];
  } catch (e) {
    console.error('Error loading DB_FILE:', e);
  }
}

// Helper: Save DB to disk
function saveDb() {
  try {
    fs.writeFile(DB_FILE, JSON.stringify(dbState, null, 2), () => {});
  } catch (err) {
    console.warn('Save DB error:', err);
  }
}

// Helper: Broadcast Real-Time Event via SSE
function broadcastEvent(eventName, payload) {
  const data = JSON.stringify({
    event: eventName,
    ...payload,
    timestamp: new Date().toISOString()
  });
  const message = `data: ${data}\n\n`;

  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch (e) {}
  });
}

// Helper: Generate structured order number (e.g. JV-20260825-000108)
function generateOrderNumber() {
  const d = new Date();
  const dateStr = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const seq = String((dbState.orders.length || 0) + 101).padStart(6, '0');
  return `JV-${dateStr}-${seq}`;
}

// Helper: Generate next 3-digit Token Number (e.g. 101 to 999)
function generateNextToken() {
  let highest = 100;
  (dbState.orders || []).forEach((o) => {
    const num = parseInt(o.tokenNumber, 10);
    if (!isNaN(num) && num > highest && num < 999) highest = num;
  });
  return String(highest + 1);
}

const server = http.createServer((req, res) => {
  // CORS Headers for LAN & Localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. HEALTH & SYSTEM STATUS (/health and /api/health)
  if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
    const now = Date.now();
    const activeDay = (dbState.businessDays || []).find((b) => b.status === 'OPEN' || b.status === 'REOPENED') || (dbState.businessDays && dbState.businessDays[0]) || {
      id: 'BD-20260831',
      businessDate: '2026-08-31',
      displayDate: '31 August 2026',
      status: 'OPEN'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      core_status: 'HEALTHY',
      database_status: 'HEALTHY',
      realtime_status: 'CONNECTED',
      restaurant_id: 'JAMANVAAR-AHM-FLAGSHIP',
      restaurant_name: (dbState.restaurant && dbState.restaurant.name) || 'JAMANVAAR — The Royal Dining',
      outlet_id: 'AHM-FLAGSHIP',
      outlet_name: (dbState.outlet && dbState.outlet.name) || 'Ahmedabad Flagship Store',
      business_day_id: activeDay.id,
      business_day_status: activeDay.status,
      business_day_display: activeDay.displayDate || activeDay.businessDate,
      active_orders_count: (dbState.orders || []).filter((o) => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED').length,
      connected_devices_count: sseClients.length + 3,
      version: '2.4.0-LOCAL-CORE',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 1b. SYNC STATUS (/sync/status)
  if (req.method === 'GET' && pathname === '/sync/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'HEALTHY',
      pending_commands: 0,
      pending_events: 0,
      last_successful_sync: new Date().toISOString(),
      failed_events: 0,
      connected_devices: [
        { id: 'POS-01', name: 'Main Counter POS', type: 'POS', status: 'ONLINE' },
        { id: 'ADMIN-01', name: 'Manager Backoffice', type: 'POS', status: 'ONLINE' },
        { id: 'KDS-01', name: 'Kitchen Display', type: 'KDS', status: 'ONLINE' },
        { id: 'CAPTAIN-01', name: 'Captain Rahul', type: 'CAPTAIN', status: 'ONLINE' }
      ]
    }));
    return;
  }

  // 1c. DEVICE FLEET (/devices)
  if (req.method === 'GET' && pathname === '/devices') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      devices: dbState.devices || [
        { id: 'POS-01', name: 'Main Counter POS (POS-01)', type: 'POS', status: 'ONLINE', platform: 'Windows Desktop' },
        { id: 'ADMIN-01', name: 'Manager Backoffice (ADMIN-01)', type: 'POS', status: 'ONLINE', platform: 'Windows Desktop' },
        { id: 'KDS-01', name: 'Kitchen Display System (KDS-01)', type: 'KDS', status: 'ONLINE', platform: 'Windows Touch' },
        { id: 'CAPTAIN-01', name: 'Captain Rahul (Floor Tab)', type: 'CAPTAIN', status: 'ONLINE', platform: 'Android Tablet' }
      ]
    }));
    return;
  }

  // 1d. DEVICE PAIRING TOKEN (/devices/pair)
  if (req.method === 'POST' && pathname === '/devices/pair') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const token = `PAIR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        restaurant_id: 'JAMANVAAR-AHM-FLAGSHIP',
        outlet_id: 'AHM-FLAGSHIP',
        port: PORT,
        expires_in_seconds: 300
      }));
    });
    return;
  }

  // 2. KIOSK HEARTBEAT
  if (req.method === 'POST' && pathname === '/api/heartbeat') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const kioskId = data.kioskId || 'KIOSK-01';
        if (!dbState.kioskHeartbeats) dbState.kioskHeartbeats = {};
        dbState.kioskHeartbeats[kioskId] = {
          lastSeenMs: Date.now(),
          lastSeenIso: new Date().toISOString(),
          version: data.version || '1.0.0',
          isPrinterOnline: data.isPrinterOnline ?? true
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, kioskId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. SSE REAL-TIME EVENT STREAM
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ event: 'CONNECTED', message: 'Connected to Local Restaurant Service' })}\n\n`);

    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
    return;
  }

  // 4. AUTHORITATIVE ORDER CREATION (POST /api/orders)
  if (req.method === 'POST' && pathname === '/api/orders') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const idempotencyKey = payload.idempotencyKey || req.headers['idempotency-key'] || `idem-${Date.now()}`;

        // IDEMPOTENCY CHECK
        if (dbState.idempotencyMap && dbState.idempotencyMap[idempotencyKey]) {
          const existingOrderId = dbState.idempotencyMap[idempotencyKey];
          const existingOrder = dbState.orders.find((o) => o.id === existingOrderId);
          if (existingOrder) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, isDuplicate: true, order: existingOrder }));
            return;
          }
        }

        // SERVER-SIDE VALIDATION
        if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Order must contain at least 1 item' }));
          return;
        }

        const kioskId = payload.kioskId || 'KIOSK-01';
        const orderType = payload.orderType || 'DINE_IN';
        const nowIso = new Date().toISOString();

        // Calculate authoritative totals
        let subtotal = 0;
        const items = payload.items.map((it, idx) => {
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          const unitPrice = Math.max(0, parseFloat(it.unitPrice) || 0);
          let modTotal = 0;
          if (it.modifiers && Array.isArray(it.modifiers)) {
            modTotal = it.modifiers.reduce((sum, m) => sum + (parseFloat(m.price) || 0), 0);
          }
          const itemTotal = (unitPrice + modTotal) * qty;
          subtotal += itemTotal;

          return {
            id: it.id || `it-${Date.now()}-${idx + 1}`,
            orderId: '',
            menuItemId: it.menuItemId || `menu-${idx}`,
            name: it.name || 'Menu Item',
            sku: it.sku || `SKU-${idx + 1}`,
            quantity: qty,
            unitPrice: unitPrice,
            modifiers: it.modifiers || [],
            specialInstructions: it.specialInstructions || undefined,
            totalPrice: itemTotal,
            kitchenStatus: 'PENDING'
          };
        });

        const discountAmount = Math.max(0, parseFloat(payload.discountAmount) || 0);
        const taxableSubtotal = Math.max(0, subtotal - discountAmount);
        const cgstAmount = Math.round(taxableSubtotal * 0.025 * 100) / 100;
        const sgstAmount = Math.round(taxableSubtotal * 0.025 * 100) / 100;
        const taxAmount = cgstAmount + sgstAmount;
        const rawTotal = taxableSubtotal + taxAmount;
        const roundOffAmount = Math.round((Math.round(rawTotal) - rawTotal) * 100) / 100;
        const totalAmount = Math.round(rawTotal);

        const orderId = payload.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const orderNumber = payload.orderNumber || generateOrderNumber();
        const tokenNumber = payload.tokenNumber || generateNextToken();

        // Attach order ID to items
        items.forEach((it) => (it.orderId = orderId));

        // Initial Timeline
        const timeline = [
          {
            status: 'NEW',
            title: `Order Created by ${kioskId}`,
            timestamp: nowIso,
            actor: kioskId
          },
          {
            status: 'CONFIRMED',
            title: `Payment Confirmed (${payload.paymentMethod || 'UPI_QR'})`,
            timestamp: nowIso,
            note: `TxID: ${payload.paymentTransactionId || 'OFFLINE_TX_OK'}`
          }
        ];

        // Authoritative Order Object
        const newOrder = {
          id: orderId,
          orderNumber,
          tokenNumber,
          restaurantId: payload.restaurantId || 'rest-jamanvaar-main',
          outletId: payload.outletId || 'out-bodakdev-01',
          kioskId,
          sessionId: payload.sessionId || `sess-${Date.now()}`,
          idempotencyKey,
          orderType,
          tableId: payload.tableId,
          tableNumber: payload.tableNumber ? String(payload.tableNumber) : undefined,
          guestCount: payload.guestCount || 1,
          customerPhone: payload.customerPhone,
          customerName: payload.customerName,
          items,
          subtotal: payload.subtotal !== undefined ? payload.subtotal : subtotal,
          discountAmount: payload.discountAmount !== undefined ? payload.discountAmount : discountAmount,
          couponCode: payload.couponCode,
          cgstAmount: payload.cgstAmount !== undefined ? payload.cgstAmount : cgstAmount,
          sgstAmount: payload.sgstAmount !== undefined ? payload.sgstAmount : sgstAmount,
          taxAmount: payload.taxAmount !== undefined ? payload.taxAmount : taxAmount,
          serviceChargeAmount: payload.serviceChargeAmount || 0,
          tipAmount: payload.tipAmount || 0,
          roundOffAmount: payload.roundOffAmount !== undefined ? payload.roundOffAmount : roundOffAmount,
          totalAmount: payload.totalAmount !== undefined ? payload.totalAmount : totalAmount,
          paymentMethod: payload.paymentMethod || 'UPI_QR',
          paymentStatus: payload.paymentStatus || 'SUCCESS',
          paymentTransactionId: payload.paymentTransactionId || `tx-${Date.now()}`,
          orderStatus: payload.orderStatus || 'NEW',
          estimatedWaitMinutes: payload.estimatedWaitMinutes || 15,
          pickupCounter: payload.pickupCounter || 'Counter 1',
          source_type: payload.source_type || 'POS',
          acknowledgementStage: payload.acknowledgementStage || 'ORDER_SENT_TO_KDS',
          timeline: payload.timeline || timeline,
          syncStatus: 'SYNCED',
          isSynced: true,
          createdAt: payload.createdAt || nowIso,
          updatedAt: payload.updatedAt || nowIso
        };

        // DATABASE TRANSACTION COMMIT
        const existingIdx = dbState.orders.findIndex((o) => o.id === orderId || o.orderNumber === orderNumber);
        if (existingIdx >= 0) {
          dbState.orders[existingIdx] = { ...dbState.orders[existingIdx], ...newOrder };
        } else {
          dbState.orders.unshift(newOrder);
        }
        if (!dbState.idempotencyMap) dbState.idempotencyMap = {};
        dbState.idempotencyMap[idempotencyKey] = orderId;

        // Log Audit Trail
        dbState.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          userId: kioskId,
          username: kioskId,
          action: 'ORDER_PLACED',
          category: 'ORDER',
          details: `Order #${newOrder.tokenNumber} (${newOrder.orderNumber}) created on ${kioskId} for ₹${newOrder.totalAmount}`,
          timestamp: nowIso
        });

        // Persist DB to disk
        saveDb();

        // EMIT REALTIME EVENT TO ALL ADMIN EXEs & KDSs
        broadcastEvent('ORDER_CREATED', {
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          tokenNumber: newOrder.tokenNumber,
          orderType: newOrder.orderType,
          totalAmount: newOrder.totalAmount,
          orderStatus: newOrder.orderStatus,
          paymentMethod: newOrder.paymentMethod,
          kioskId: newOrder.kioskId,
          order: newOrder
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, order: newOrder }));
      } catch (err) {
        console.error('Order creation error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 5. GET ORDERS (GET /api/orders)
  if (req.method === 'GET' && pathname === '/api/orders') {
    const statusParam = urlObj.searchParams.get('status');
    const kioskParam = urlObj.searchParams.get('kioskId');
    const searchParam = (urlObj.searchParams.get('search') || '').toLowerCase();

    let filtered = [...(dbState.orders || [])];

    if (statusParam && statusParam !== 'ALL') {
      filtered = filtered.filter((o) => o.orderStatus === statusParam);
    }
    if (kioskParam && kioskParam !== 'ALL') {
      filtered = filtered.filter((o) => o.kioskId === kioskParam);
    }
    if (searchParam) {
      filtered = filtered.filter((o) =>
        o.orderNumber.toLowerCase().includes(searchParam) ||
        o.tokenNumber.includes(searchParam) ||
        (o.customerPhone && o.customerPhone.includes(searchParam)) ||
        (o.customerName && o.customerName.toLowerCase().includes(searchParam))
      );
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(filtered));
    return;
  }

  // 6. GET SINGLE ORDER (GET /api/orders/:id)
  if (req.method === 'GET' && pathname.startsWith('/api/orders/')) {
    const id = pathname.replace('/api/orders/', '');
    const order = (dbState.orders || []).find((o) => o.id === id || o.orderNumber === id);
    if (!order) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(order));
    return;
  }

  // 7. ACKNOWLEDGE ORDER (POST /api/orders/:id/acknowledge)
  if (req.method === 'POST' && pathname.includes('/acknowledge')) {
    const id = pathname.split('/')[3];
    const order = (dbState.orders || []).find((o) => o.id === id);
    if (!order) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
      return;
    }

    order.orderStatus = 'CONFIRMED';
    order.acknowledgementStage = 'ORDER_SENT_TO_KDS';
    order.updatedAt = new Date().toISOString();
    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'CONFIRMED',
      title: 'Order Acknowledged by Admin',
      timestamp: order.updatedAt,
      actor: 'Admin'
    });

    saveDb();

    broadcastEvent('ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      orderStatus: order.orderStatus,
      order
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, order }));
    return;
  }

  // 8. UPDATE ORDER STATUS (PATCH /api/orders/:id/status)
  if (req.method === 'PATCH' && pathname.startsWith('/api/orders/')) {
    const parts = pathname.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const order = (dbState.orders || []).find((o) => o.id === id);
        if (!order) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Order not found' }));
          return;
        }

        const prevStatus = order.orderStatus;
        const newStatus = data.status || prevStatus;
        order.orderStatus = newStatus;
        order.updatedAt = new Date().toISOString();

        if (!order.timeline) order.timeline = [];
        order.timeline.push({
          status: newStatus,
          title: `Status advanced from ${prevStatus} to ${newStatus}`,
          timestamp: order.updatedAt,
          note: data.note,
          actor: data.actor || 'Admin'
        });

        saveDb();

        broadcastEvent('ORDER_STATUS_CHANGED', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          tokenNumber: order.tokenNumber,
          orderStatus: newStatus,
          order
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, order }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9. BIDIRECTIONAL SYNC (GET /api/sync & POST /api/sync)
  if (pathname === '/api/sync') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dbState));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const incoming = JSON.parse(body || '{}');
          if (incoming.orders && Array.isArray(incoming.orders)) {
            const map = new Map();
            (dbState.orders || []).forEach((o) => map.set(o.id, o));
            incoming.orders.forEach((o) => map.set(o.id, o));
            dbState.orders = Array.from(map.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
          ['restaurant', 'outlet', 'categories', 'menuItems', 'modifierGroups', 'combos', 'tables', 'coupons', 'kiosks', 'receiptConfig', 'receiptRecords', 'printJobs', 'auditLogs', 'serviceRequests', 'shifts', 'cashMovements', 'kots', 'heldOrders', 'reservations', 'waitlist', 'inventoryItems', 'stockMovements', 'recipes', 'customerAccounts', 'users', 'roles', 'configuredPrinters', 'license', 'taxGroups'].forEach((k) => {
            if (incoming[k]) {
              if (Array.isArray(incoming[k])) {
                if (incoming[k].length > 0) dbState[k] = incoming[k];
              } else {
                dbState[k] = incoming[k];
              }
            }
          });
          saveDb();
          broadcastEvent('DB_UPDATE', { state: dbState });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: dbState.orders.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  
  // --- STATIC WEB APP FILE SERVER (POS, POS Admin, Kiosk, Kiosk Admin) ---
  const serveStatic = (baseDir, subPath) => {
    let filePath = path.join(baseDir, subPath);
    const ext = path.extname(subPath).toLowerCase();

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (!ext || ext === '.html') {
        filePath = path.join(baseDir, 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Asset not found');
        return;
      }
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Static build not found.');
      return;
    }

    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf'
    };
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  };

  const getDir = (folderName, altDist) => {
    const candidates = [
      path.join(__dirname, '..', folderName),
      path.join(__dirname, folderName),
      path.join(__dirname, '..', 'app'),
      path.join(__dirname, 'app'),
      path.join(__dirname, '..', 'apps', altDist, 'dist'),
      path.join(__dirname, '..', '..', 'apps', altDist, 'dist')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
        return p;
      }
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return path.join(__dirname, '..', 'app');
  };

  const posDir = getDir('pos_app', 'restaurant-system/pos');
  const posAdminDir = getDir('pos_admin_app', 'restaurant-system/pos-admin');
  const kioskDir = getDir('kiosk_app', 'kiosk-system/kiosk-user');
  const kioskAdminDir = getDir('kiosk_admin_app', 'kiosk-system/kiosk-admin');

  // Handle Root Favicons, Manifests & Application Icons
  if (pathname === '/favicon.ico' || pathname === '/favicon.svg' || pathname === '/icon.png' || pathname === '/app-icon.png' || pathname === '/jamanvaar.png' || pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    const iconFile = (pathname === '/favicon.svg')
      ? path.join(posDir, 'favicon.svg')
      : (pathname === '/favicon.ico')
      ? path.join(posDir, 'favicon.ico')
      : (pathname === '/manifest.json' || pathname === '/manifest.webmanifest')
      ? path.join(posDir, 'manifest.json')
      : path.join(posDir, 'app-icon.png');

    if (fs.existsSync(iconFile)) {
      const mime = pathname.endsWith('.svg')
        ? 'image/svg+xml'
        : pathname.endsWith('.ico')
        ? 'image/x-icon'
        : pathname.endsWith('.json') || pathname.endsWith('.webmanifest')
        ? 'application/manifest+json; charset=utf-8'
        : 'image/png';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(iconFile).pipe(res);
    }
  }

  if (pathname === '/pos') { res.writeHead(302, { Location: '/pos/' }); res.end(); return; }
  if (pathname === '/admin' || pathname === '/pos-admin') { res.writeHead(302, { Location: '/pos-admin/' }); res.end(); return; }
  if (pathname === '/kiosk') { res.writeHead(302, { Location: '/kiosk/' }); res.end(); return; }
  if (pathname === '/kiosk-admin') { res.writeHead(302, { Location: '/kiosk-admin/' }); res.end(); return; }

  if (pathname.startsWith('/pos/')) {
    return serveStatic(posDir, pathname.replace(/^\/pos\//, '') || 'index.html');
  }
  if (pathname.startsWith('/pos-admin/')) {
    return serveStatic(posAdminDir, pathname.replace(/^\/pos-admin\//, '') || 'index.html');
  }
  if (pathname.startsWith('/kiosk/')) {
    return serveStatic(kioskDir, pathname.replace(/^\/kiosk\//, '') || 'index.html');
  }
  if (pathname.startsWith('/kiosk-admin/')) {
    return serveStatic(kioskAdminDir, pathname.replace(/^\/kiosk-admin\//, '') || 'index.html');
  }

  if (pathname.startsWith('/assets/')) {
    const sub = pathname.replace(/^\//, '');
    for (const d of [posDir, posAdminDir, kioskDir, kioskAdminDir]) {
      const fullP = path.join(d, sub);
      if (fs.existsSync(fullP) && !fs.statSync(fullP).isDirectory()) {
        return serveStatic(d, sub);
      }
    }
    return serveStatic(posDir, sub);
  }

  // Root Landing Page
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JAMANVAAR Restaurant Terminal Hub</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAF8F5; color: #0B253A; margin: 0; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 85vh; }
    .card { background: white; border: 2px solid #EBE6DD; border-radius: 28px; padding: 40px; max-width: 680px; width: 100%; text-align: center; box-shadow: 0 16px 40px rgba(11,37,58,0.08); }
    .logo-img { height: 72px; width: auto; margin-bottom: 16px; }
    h1 { color: #0B253A; margin: 0 0 8px 0; font-size: 26px; font-weight: 900; }
    p { color: #4A5568; font-size: 14px; margin: 0 0 28px 0; }
    .badge { background: #ECFDF5; color: #047857; padding: 6px 16px; border-radius: 99px; font-size: 12px; font-weight: 800; border: 1px solid #A7F3D0; display: inline-block; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; text-align: left; }
    .app-card { display: flex; flex-direction: column; padding: 18px 20px; border-radius: 20px; text-decoration: none; border: 2px solid transparent; transition: all 0.15s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .app-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
    .app-pos { background: #0B253A; color: white; border-color: #0B253A; }
    .app-admin { background: #FFF7ED; color: #0B253A; border-color: #FDBA74; }
    .app-kiosk { background: #E66817; color: white; border-color: #E66817; }
    .app-kiosk-admin { background: #F1F5F9; color: #0B253A; border-color: #CBD5E1; }
    .app-title { font-weight: 900; font-size: 16px; margin-bottom: 4px; display: flex; items-center; gap: 8px; }
    .app-desc { font-size: 12px; opacity: 0.85; line-height: 1.4; }
    .footer-credit { margin-top: 28px; font-size: 11px; color: #8C9BAE; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <img src="/app-icon.png" alt="JAMANVAAR" class="logo-img">
    <div class="badge">● 100% Local On-Premise Restaurant Hub (:5178)</div>
    <h1>JAMANVAAR Restaurant Suite</h1>
    <p>Select which terminal application you wish to launch:</p>
    <div class="grid">
      <a href="/pos/" class="app-card app-pos">
        <div class="app-title">💳 JAMANVAAR POS</div>
        <div class="app-desc">High-Speed Counter Billing, Table Management & Cash Drawer</div>
      </a>
      <a href="/pos-admin/" class="app-card app-admin">
        <div class="app-title">📊 POS Admin HQ</div>
        <div class="app-desc">Management, Reports, KDS Kitchen Display & Inventory</div>
      </a>
      <a href="/kiosk/" class="app-card app-kiosk">
        <div class="app-title">📱 Touch Kiosk</div>
        <div class="app-desc">Customer Self-Ordering & Digital Touchscreen Terminal</div>
      </a>
      <a href="/kiosk-admin/" class="app-card app-kiosk-admin">
        <div class="app-title">⚙️ Kiosk Admin</div>
        <div class="app-desc">Fleet Control, Terminal Catalog & Upsell Rules</div>
      </a>
    </div>
    <div class="footer-credit">JAMANVAAR by KELVIONTECH • Enterprise Restaurant Operating System</div>
  </div>
</body>
</html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[JAMANVAAR Local Service] Service already active on http://${HOST}:${PORT}. Continuing with running service.`);
    process.exit(0);
  } else {
    console.error('[JAMANVAAR Local Service] Server error:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`[JAMANVAAR Local Restaurant Service] ACTIVE & LISTENING`);
  console.log(`URL: http://${HOST}:${PORT}`);
  console.log(`Mode: 100% Local On-Premise (No Cloud Required)`);
  console.log(`=======================================================`);
});
