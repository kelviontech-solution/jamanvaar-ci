async (page) => {
  const ctx = page.context(); const H = ctx.__H = {};
  const P = { ra: 5176, pos: 5175, kds: 5179, cap: 5177, ka: 5173, ku: 5174, sa: 5180 };
  H.get = (k) => ctx.pages().find(x => x.url().includes(':' + P[k]));
  for (const k of Object.keys(P)) if (!H.get(k)) { const p = await ctx.newPage(); await p.goto('http://localhost:' + P[k] + '/'); }
  const DES = /log ?out|sign ?out|delete|remove|clear|reset|wipe|archive|factory|destroy|revoke|close business|end shift|void|refund|discard|suspend|trash/i;
  const POLL = /orders\/sync|entity-sync|heartbeat|ai-config|:5178|refresh|platform\/(me|system-health)/;
  const hs = (s) => { s = s.replace(/\d{1,2}:\d{2}(:\d{2})?( ?[APap][Mm])?/g, 'T'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const OV = 'div.fixed.inset-0:visible, [role=dialog]:visible';
  const oc = (p) => p.locator(OV).count();
  H.close = async (p, b) => { for (let k = 0; k < 3; k++) { if ((await oc(p)) <= b) return true; const ov = p.locator(OV).last(); const x = ov.getByRole('button', { name: /^(cancel|close|×|x|done|back|dismiss|no|got it|ok|skip|later|close audit)$/i }).first(); if (await x.count()) await x.click({ timeout: 1500 }).catch(() => {}); else await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); } return (await oc(p)) <= b; };
  H.desc = async (p) => { const ov = p.locator(OV).last(); const t = ((await ov.innerText({ timeout: 1500 }).catch(() => '')) || '').replace(/\n+/g, ' | ').slice(0, 80); const f = await ov.locator('input:visible,select:visible,textarea:visible').evaluateAll(e => e.map(x => (x.placeholder || x.name || x.type) + (x.required ? '*' : ''))).catch(() => []); const b = (await ov.getByRole('button').allInnerTexts().catch(() => [])).map(s => s.replace(/\n+/g, ' ').trim()).filter(Boolean); return t + ' || F: ' + f.slice(0, 10).join(',') + ' || B: ' + b.slice(0, 8).join('/'); };
  H.fuzz = async (p, o = {}) => {
    const sc = o.scope || 'main', mp = o.maxPer || 2, sk = o.skip || DES, lim = o.limit || 60, rp = o.reopen || (async () => { await p.reload(); await p.waitForTimeout(3500); });
    const root = p.locator(sc).first();
    const sel = 'button:visible,[role=button]:visible,a[href]:visible,select:visible,input[type=checkbox]:visible,input[type=radio]:visible,summary:visible,[role=tab]:visible';
    const out = [], er = [], rq = [], dl = [];
    const a = e => er.push('PAGEERR ' + e.message.slice(0, 70)); const b = r => { const u = r.url(); if (/:4000\/api/.test(u) && !POLL.test(u) && r.method() !== 'GET') rq.push(r.method() + ' ' + u.split('/api/v1')[1]); }; const c = r => { const u = r.url(); if (r.status() >= 400 && !POLL.test(u)) rq.push('HTTP' + r.status() + ' ' + u.split('/api/v1')[1]); }; const d = x => { dl.push(x.type() + ':' + x.message().slice(0, 50)); x.dismiss().catch(() => {}); };
    p.on('pageerror', a); p.on('request', b); p.on('response', c); p.on('dialog', d);
    const n = await root.locator(sel).count(); const it = [];
    for (let i = 0; i < n; i++) { const el = root.locator(sel).nth(i); const l = ((await el.innerText({ timeout: 700 }).catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || (await el.getAttribute('title').catch(() => '')) || (await el.evaluate(e => e.tagName + ':' + (e.className || '').toString().slice(0, 20)).catch(() => '?'))).replace(/\n+/g, ' ').trim().slice(0, 40); it.push({ i, l }); }
    const seen = {}; let done = 0;
    for (const t of it) {
      if (done >= lim) { out.push('…limit'); break; }
      seen[t.l] = (seen[t.l] || 0) + 1; if (seen[t.l] > mp) continue;
      if (sk.test(t.l)) { out.push(`[${t.i}] "${t.l}" SKIP-destructive`); continue; }
      if ((await oc(p)) > 0) { await H.close(p, 0); if ((await oc(p)) > 0) { await rp(); } }
      const el = root.locator(sel).nth(t.i);
      const cur = ((await el.innerText({ timeout: 700 }).catch(() => '')) || '').replace(/\n+/g, ' ').trim().slice(0, 40);
      if (cur !== t.l && t.l && !cur.startsWith(t.l.slice(0, 8))) { out.push(`[${t.i}] "${t.l}" shifted`); continue; }
      const hd = async () => ((await p.locator(o.hsel || 'main h1, main h2').first().innerText({ timeout: 600 }).catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 45);
      const h0 = await hd(), b0 = await oc(p), u0 = p.url(), s0 = hs(await p.locator('body').innerText().catch(() => ''));
      const e0 = er.length, r0 = rq.length, d0 = dl.length; const tag = await el.evaluate(e => e.tagName).catch(() => ''); let st = '';
      try { if (tag === 'SELECT') { const op = await el.locator('option').evaluateAll(x => x.map(y => y.value)); if (op.length > 1) await el.selectOption(op[1]); else st = 'single-opt'; } else await el.click({ timeout: 2200, noWaitAfter: true }); } catch (e) { st = 'UNCLICKABLE'; }
      await p.waitForTimeout(600);
      const ov = await oc(p), s1 = hs(await p.locator('body').innerText().catch(() => '')); const pr = [];
      if (st) pr.push(st);
      if (ov > b0) { pr.push('MODAL: ' + await H.desc(p)); if (!(await H.close(p, b0))) { pr.push('STUCK'); await rp(); } }
      else if (p.url() !== u0) { pr.push('NAV→' + p.url().replace(/^https?:\/\/[^/]+/, '')); if (!o.allowNav) { await p.goBack().catch(() => {}); await p.waitForTimeout(600); } }
      else { const h1 = await hd(); if (h1 !== h0) { pr.push('NAV→"' + h1 + '"'); await rp(); } else if (s1 !== s0) pr.push('changed'); }
      if (er.length > e0) pr.push(er.slice(e0).join(';')); if (rq.length > r0) pr.push('REQ ' + rq.slice(r0).join(',')); if (dl.length > d0) pr.push('DLG ' + dl.slice(d0).join(','));
      if (!pr.length) pr.push('NOOP');
      out.push(`[${t.i}] "${t.l}" → ` + pr.join(' | ')); done++;
    }
    p.off('pageerror', a); p.off('request', b); p.off('response', c); p.off('dialog', d);
    return out;
  };
  H.nav = async (p, name) => { await p.getByRole('button', { name, exact: true }).first().click({ timeout: 4000 }); await p.waitForTimeout(1300); };
  H.go = async (k, name) => { const p = H.get(k); await p.reload(); await p.waitForTimeout(4000); if (name) await H.nav(p, name); return p; };
  return 'ready ' + ctx.pages().length;
}
