async (page) => {
  const ctx = page.context();
  const H = ctx.__H = {};
  H.get = (port) => ctx.pages().find(x => x.url().includes(':' + port));
  const DESTRUCT = /log ?out|sign ?out|delete|remove|clear|reset|wipe|archive|factory|destroy|revoke|close business|end shift|void|refund|discard|suspend|cancel order|trash/i;
  const POLL = /orders\/sync|entity-sync|heartbeat|ai-config|:5178|refresh/;
  H.hash = (s) => { s = s.replace(/\d{1,2}:\d{2}(:\d{2})?( ?[APap][Mm])?/g, 'T'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  H.overlayCount = (p) => p.locator('div.fixed.inset-0:visible, [role=dialog]:visible').count();
  H.closeOverlay = async (p, base) => {
    for (let k = 0; k < 3; k++) {
      if ((await H.overlayCount(p)) <= base) return true;
      const ov = p.locator('div.fixed.inset-0:visible, [role=dialog]:visible').last();
      const b = ov.getByRole('button', { name: /^(cancel|close|×|x|done|back|dismiss|no|got it|ok|skip|later)$/i }).first();
      if (await b.count()) await b.click({ timeout: 1500 }).catch(() => {});
      else await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(400);
    }
    return (await H.overlayCount(p)) <= base;
  };
  H.describeOverlay = async (p) => {
    const ov = p.locator('div.fixed.inset-0:visible, [role=dialog]:visible').last();
    const title = ((await ov.innerText({ timeout: 1500 }).catch(() => '')) || '').replace(/\n+/g, ' | ').slice(0, 90);
    const inputs = await ov.locator('input:visible, select:visible, textarea:visible').evaluateAll(els => els.map(e => (e.placeholder || e.name || e.type) + (e.required ? '*' : ''))).catch(() => []);
    const btns = (await ov.getByRole('button').allInnerTexts().catch(() => [])).map(s => s.replace(/\n+/g, ' ').trim()).filter(Boolean);
    return title + ' || fields: ' + inputs.slice(0, 12).join(',') + ' || btns: ' + btns.slice(0, 10).join(' / ');
  };
  H.fuzz = async (p, opt = {}) => {
    const scope = opt.scope || 'main', maxPer = opt.maxPer || 2, skip = opt.skip || DESTRUCT, limit = opt.limit || 80;
    const root = p.locator(scope).first();
    const sel = 'button:visible, [role="button"]:visible, a[href]:visible, select:visible, input[type="checkbox"]:visible, input[type="radio"]:visible, summary:visible, [role="tab"]:visible';
    const out = [], errs = [], reqs = [], dlg = [];
    const onErr = e => errs.push('PAGEERR ' + e.message.slice(0, 80));
    const onReq = r => { const u = r.url(); if (/localhost:4000\/api/.test(u) && !POLL.test(u) && r.method() !== 'GET') reqs.push(r.method() + ' ' + u.split('/api/v1')[1]); };
    const onRes = r => { const u = r.url(); if (r.status() >= 400 && !/:5178|\/refresh|platform\/(me|system-health)/.test(u)) reqs.push('HTTP' + r.status() + ' ' + u.split('/api/v1')[1]); };
    const onDlg = d => { dlg.push(d.type() + ':' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); };
    p.on('pageerror', onErr); p.on('request', onReq); p.on('response', onRes); p.on('dialog', onDlg);
    const n = await root.locator(sel).count();
    const items = [];
    for (let i = 0; i < n; i++) {
      const el = root.locator(sel).nth(i);
      const label = ((await el.innerText({ timeout: 800 }).catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || (await el.getAttribute('title').catch(() => '')) || (await el.evaluate(e => e.tagName + ':' + (e.className || '').toString().slice(0, 25)).catch(() => '?'))).replace(/\n+/g, ' ').trim().slice(0, 45);
      items.push({ i, label });
    }
    const seen = {};
    let done = 0;
    for (const it of items) {
      if (done >= limit) { out.push('… limit reached'); break; }
      seen[it.label] = (seen[it.label] || 0) + 1;
      if (seen[it.label] > maxPer) continue;
      if (skip.test(it.label)) { out.push(`[${it.i}] "${it.label}" → SKIPPED(destructive)`); continue; }
      if ((await H.overlayCount(p)) > (opt.baseline || 0)) { await H.closeOverlay(p, opt.baseline || 0); if ((await H.overlayCount(p)) > (opt.baseline || 0)) { await (opt.reopen ? opt.reopen() : p.reload()); await p.waitForTimeout(2500); } }
      const el = root.locator(sel).nth(it.i);
      const cur = ((await el.innerText({ timeout: 800 }).catch(() => '')) || '').replace(/\n+/g, ' ').trim().slice(0, 45);
      if (cur !== it.label && it.label && !cur.startsWith(it.label.slice(0, 10))) { out.push(`[${it.i}] "${it.label}" → (element shifted, skipped)`); continue; }
      const hdOf = async () => ((await p.locator(opt.headingSel || 'main h1, main h2').first().innerText({ timeout: 700 }).catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 50);
      const hd0 = await hdOf();
      const base = await H.overlayCount(p), u0 = p.url(), h0 = H.hash(await p.locator('body').innerText().catch(() => ''));
      const e0 = errs.length, r0 = reqs.length, d0 = dlg.length;
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      let status = '';
      try {
        if (tag === 'SELECT') { const opts = await el.locator('option').evaluateAll(o => o.map(x => x.value)); if (opts.length > 1) await el.selectOption(opts[1]); else status = 'single-option'; }
        else await el.click({ timeout: 2500, noWaitAfter: true });
      } catch (e) { status = 'UNCLICKABLE(' + e.message.split('\n')[0].slice(0, 40) + ')'; }
      await p.waitForTimeout(650);
      const ov = await H.overlayCount(p), h1 = H.hash(await p.locator('body').innerText().catch(() => ''));
      const parts = [];
      if (status) parts.push(status);
      if (ov > base) { parts.push('MODAL: ' + await H.describeOverlay(p)); const ok = await H.closeOverlay(p, base); if (!ok) { parts.push('STUCK→reopen'); await (opt.reopen ? opt.reopen() : p.reload()); await p.waitForTimeout(2500); } }
      else if (p.url() !== u0) parts.push('NAV→' + p.url().replace(/^https?:\/\/[^/]+/, ''));
      else if ((await hdOf()) !== hd0) { parts.push('NAV→"' + (await hdOf()) + '"'); await (opt.reopen ? opt.reopen() : p.reload()); await p.waitForTimeout(2000); }
      else if (h1 !== h0) parts.push('changed');
      if (errs.length > e0) parts.push(errs.slice(e0).join(';'));
      if (reqs.length > r0) parts.push('REQ ' + reqs.slice(r0).join(','));
      if (dlg.length > d0) parts.push('DIALOG ' + dlg.slice(d0).join(','));
      if (!parts.length) parts.push('NOOP');
      out.push(`[${it.i}] "${it.label}" → ` + parts.join(' | '));
      done++;
      if (p.url() !== u0 && !opt.allowNav) { await p.goBack().catch(() => {}); await p.waitForTimeout(600); }
    }
    p.off('pageerror', onErr); p.off('request', onReq); p.off('response', onRes); p.off('dialog', onDlg);
    return out;
  };
  H.nav = async (p, name, opt = {}) => { await p.getByRole('button', { name, exact: opt.exact !== false }).first().click({ timeout: 4000 }); await p.waitForTimeout(1500); };
  return 'harness ready';
}
