const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5178;
const HOST = '0.0.0.0';

// Determine safe persistence path for production standalone service
function getDatabaseFilePath() {
  if (process.env.JAMANVAAR_DB_PATH) return process.env.JAMANVAAR_DB_PATH;
  
  // AppData persistence directory for Windows
  const appData = process.env.APPDATA || (process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Roaming') : os.homedir());
  const jamanvaarDataDir = path.join(appData, 'JAMANVAAR', 'data');
  if (!fs.existsSync(jamanvaarDataDir)) {
    try {
      fs.mkdirSync(jamanvaarDataDir, { recursive: true });
    } catch (e) {}
  }
  
  const appDataDb = path.join(jamanvaarDataDir, 'live_db.json');
  if (fs.existsSync(appDataDb)) return appDataDb;

  // Local cwd fallback
  const localDb = path.join(process.cwd(), 'live_db.json');
  if (fs.existsSync(localDb)) return localDb;

  // Relative workspace path fallback
  const workspaceDb = path.join(__dirname, '../shared/database/src/live_db.json');
  if (fs.existsSync(workspaceDb)) return workspaceDb;

  return appDataDb;
}

const DB_FILE = getDatabaseFilePath();
console.log(`[JAMANVAAR Local Core] Starting on http://${HOST}:${PORT}`);
console.log(`[JAMANVAAR Local Core] Active Database Path: ${DB_FILE}`);

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

const server = http.createServer((req, res) => {
  // CORS Headers for LAN connectivity
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-idempotency-key, x-device-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health Endpoint
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'HEALTHY',
      service: 'JAMANVAAR Local Core Engine',
      version: '1.0.0',
      connectedClients: sseClients.length,
      ordersCount: dbState.orders.length,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // SSE Stream
  if (url.pathname === '/events' || url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ event: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
    return;
  }

  // Orders API
  if (url.pathname === '/api/orders') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dbState.orders));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const order = JSON.parse(body);
          if (!order.id) order.id = 'ORD-' + Date.now();
          order.createdAt = order.createdAt || new Date().toISOString();
          dbState.orders.push(order);
          saveDb();
          broadcastEvent('ORDER_CREATED', { order });

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, order }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[JAMANVAAR Local Core] Server running on http://${HOST}:${PORT}`);
});
