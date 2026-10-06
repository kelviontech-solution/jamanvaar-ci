const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('playwright/test');
const root = path.resolve(__dirname, '../..');
const privateDir = path.join(root, '.jamanvaar/browser-audit');
const reportDir = path.join(root, 'docs/reports/browser-qa-2026-10-06');
fs.mkdirSync(path.join(reportDir, 'evidence'), { recursive: true });
let state = JSON.parse(fs.readFileSync(path.join(privateDir, 'private-state.json')));
const ports = { super: 5180, admin: 5176, adminprod: 5286, pos: 5175, captain: 5177, kds: 5179, kiosk: 5174, qr: 5190 };
const contexts = [];
const scrub = value => String(value).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]').replace(/JMV-[A-Z0-9-]+/g, '[ACTIVATION KEY REDACTED]').split(state.platformPassword).join('[PASSWORD REDACTED]').split(state.ownerPassword).join('[PASSWORD REDACTED]');
const append = (name, data) => fs.appendFileSync(path.join(reportDir, name), JSON.stringify(data) + '\n');
const saveState = () => fs.writeFileSync(path.join(privateDir, 'private-state.json'), JSON.stringify(state, null, 2));
async function open(app, role = app, viewport = { width: 1440, height: 960 }) {
  const ctx = await chromium.launchPersistentContext(path.join(privateDir, `profile-${role}`), { headless: true, viewport });
  contexts.push(ctx);
  ctx.setDefaultTimeout(10000);
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('response', r => {
    if (new URL(r.url()).pathname === '/api/v1/realtime/stream') append('realtime-connections.jsonl', { at: new Date().toISOString(), app, role, status: r.status(), contentType: r.headers()['content-type'] });
  });
  if (app === 'super') p.on('response', async r => {
    if (/\/platform-auth\/(refresh|verify-otp)$/.test(r.url()) && r.status() === 200) {
      const body = await r.json().catch(() => null);
      if (body?.accessToken) { state.platformToken = body.accessToken; saveState(); }
    }
  });
  if (app === 'admin') p.on('response', async r => {
    if (/\/tenant-auth\/refresh$/.test(r.url()) && r.status() === 200) {
      const body = await r.json().catch(() => null);
      if (body?.accessToken) {
        const activation = role === 'owner-b' ? state.adminBActivation : role === 'admin' ? state.adminActivation : role === 'adminprod' ? state.adminProdActivation : null;
        if (activation) { activation.accessToken = body.accessToken; saveState(); }
      }
    }
  });
  p.on('requestfailed', r => { if (!new URL(r.url()).pathname.startsWith('/api/v1/')) append('resource-failures.jsonl', { app, role, url: r.url().replace(/\?.*$/, ''), failure: r.failure()?.errorText }); });
  p.on('pageerror', e => append('console.jsonl', { app, role, type: 'pageerror', message: scrub(e.message), url: p.url() }));
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) append('console.jsonl', { app, role, type: m.type(), message: scrub(m.text()), url: p.url() }); });
  const pending = new Map();
  p.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/v1/')) pending.set(r, performance.now()); });
  p.on('requestfailed', r => { if (pending.has(r)) { append('network.jsonl', { app, role, method: r.method(), endpoint: new URL(r.url()).pathname, failure: r.failure()?.errorText, ms: +(performance.now() - pending.get(r)).toFixed(2) }); pending.delete(r); } });
  p.on('requestfinished', async r => {
    if (!pending.has(r)) return;
    const ms = performance.now() - pending.get(r); pending.delete(r);
    const response = await r.response();
    const size = await r.sizes().catch(() => ({}));
    append('network.jsonl', { at: new Date().toISOString(), app, role, method: r.method(), endpoint: new URL(r.url()).pathname, status: response?.status(), ms: +ms.toFixed(2), bytes: size.responseBodySize });
  });
  p._audit = { app, role, pending, ctx };
  await p.goto(`http://localhost:${ports[app]}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  return p;
}
async function snap(p, label) {
  const file = `${label.replace(/[^a-z0-9_-]/gi, '-')}.png`;
  await p.screenshot({ path: path.join(reportDir, 'evidence', file), fullPage: true });
  const info = await p.evaluate(() => ({ title: document.title, text: document.body.innerText, headings: [...document.querySelectorAll('h1,h2,h3')].map(e => e.textContent), buttons: [...document.querySelectorAll('button')].map(e => ({ text: e.innerText, aria: e.getAttribute('aria-label'), title: e.title, disabled: e.disabled })), inputs: [...document.querySelectorAll('input,select,textarea')].map(e => ({ tag: e.tagName, type: e.type, placeholder: e.getAttribute('placeholder'), name: e.name, id: e.id, options: e.tagName === 'SELECT' ? [...e.options].map(o => ({ value: o.value, text: o.text })) : undefined })), links: [...document.querySelectorAll('a[href]')].map(e => ({ text: e.textContent, href: e.getAttribute('href') })), overflow: document.documentElement.scrollWidth > innerWidth }));
  fs.writeFileSync(path.join(reportDir, 'evidence', file.replace('.png', '.json')), scrub(JSON.stringify(info, null, 2)));
  return info;
}
async function test(p, feature, fn, extra = {}) {
  const start = performance.now();
  const id = `${p._audit.app}-${Date.now()}`;
  try {
    const evidence = await fn();
    append('test-matrix.jsonl', { id, app: p._audit.app, role: p._audit.role, page: p.url(), feature, result: 'PASS', ms: +(performance.now() - start).toFixed(2), evidence: evidence ?? null, ...extra });
    console.log(`PASS ${p._audit.app}: ${feature}`);
    return true;
  } catch (err) {
    const shot = `failure-${id}`;
    await snap(p, shot).catch(() => {});
    append('test-matrix.jsonl', { id, app: p._audit.app, role: p._audit.role, page: p.url(), feature, result: 'FAIL', ms: +(performance.now() - start).toFixed(2), error: scrub(err.message), screenshot: `evidence/${shot}.png`, ...extra });
    console.log(`FAIL ${p._audit.app}: ${feature}: ${scrub(err.message).slice(0, 230)}`);
    return false;
  }
}
async function api(method, endpoint, data, token = state.platformToken) {
  const res = await fetch(`http://localhost:${state.port}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
async function mustApi(method, endpoint, data, token) { const r = await api(method, endpoint, data, token); if (r.status >= 400) throw Error(`${method} ${endpoint}: ${r.status}: ${scrub(JSON.stringify(r.body)).slice(0, 700)}`); return r.body; }
async function close() { for (const c of contexts) await c.close(); }
module.exports = { fs, path, root, privateDir, reportDir, state, saveState, open, snap, test, api, mustApi, close, append, expect, ports };
