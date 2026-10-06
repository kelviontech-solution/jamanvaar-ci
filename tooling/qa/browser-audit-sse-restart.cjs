// Fault injection affects ONLY this audit's isolated API process. No application code is changed.
const { execFileSync, spawn } = require('node:child_process');
const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');
async function main() {
  const pid = Number(process.argv[2]);
  if (!Number.isInteger(pid) || pid < 1) throw Error('Supply the verified isolated QA API PID');
  const command = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`], { encoding: 'utf8', windowsHide: true });
  if (!command.includes('tooling/qa/browser-audit-server.cjs')) throw Error('Refusing to stop a process that is not the isolated QA API');
  const pages = await Promise.all(['pos', 'kds'].map(async app => { const p = await q.open(app); await login(p, app, app === 'pos' ? 'Cashier' : 'Kitchen'); return p; }));
  const observed = pages.map(p => ({ p, response: p.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/realtime/stream' && r.status() === 200, { timeout: 45000 }).then(r => ({ ok: true, contentType: r.headers()['content-type'], at: Date.now() }), e => ({ ok: false, error: e.message })) }));
  const start = Date.now();
  process.kill(pid);
  await pages[0].waitForTimeout(1800);
  const child = spawn(process.execPath, ['tooling/qa/browser-audit-server.cjs'], { cwd: q.root, detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  q.fs.writeFileSync(q.path.join(q.privateDir, 'restarted-api-pid.txt'), String(child.pid));
  for (const { p, response } of observed) await q.test(p, 'Authenticated SSE reconnects after isolated API process restart', async () => {
    const result = await response;
    q.expect(result.ok, result.error).toBe(true); q.expect(result.contentType).toContain('text/event-stream');
    return { status: 200, fault: 'isolated API process restart', reconnectMs: result.at - start, deviceAuthPreserved: true };
  });
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
