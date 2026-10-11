const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync, createWriteStream } = require('node:fs');
const { resolve } = require('node:path');
const [name, executable, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name ?? '')) throw Error('Specify a safe check name');
const folder = resolve(__dirname, 'evidence'); mkdirSync(folder, { recursive: true });
const log = createWriteStream(resolve(folder, `${name}.log`));
const startedAt = new Date().toISOString();
const resultPath = resolve(folder, `${name}.json`);
writeFileSync(resultPath, JSON.stringify({ command: [executable, ...args], startedAt, status: 'RUNNING', exitCode: null }, null, 2));
const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let tail = '';
const record = chunk => { const text = chunk.toString(); log.write(text); tail = (tail + text).slice(-4500); };
child.stdout.on('data', record); child.stderr.on('data', record);
child.on('error', error => { record(String(error)); });
child.on('close', (exitCode, signal) => {
  log.end(); writeFileSync(resultPath, JSON.stringify({ command: [executable, ...args], startedAt, finishedAt: new Date().toISOString(), status: exitCode === 0 ? 'PASSED' : 'FAILED', exitCode, signal }, null, 2));
  process.stdout.write(tail); process.exitCode = exitCode ?? 1;
});
