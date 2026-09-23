// Kills whatever is already listening on the given ports before a dev server starts on
// them. Without this, a stray process left over from a previous session (window closed
// without Ctrl+C, crashed terminal, etc.) silently forces Vite to fall back to the next
// port (5180 -> 5181), which CORS_ALLOWED_ORIGINS in cloud/api/src/main.ts does not
// whitelist -- every request then fails as an opaque "Cloud API is unreachable" error
// that has nothing to do with the API actually being down.
const { execSync } = require('child_process');

const ports = process.argv.slice(2).map(Number).filter((p) => Number.isInteger(p) && p > 0);
if (ports.length === 0) process.exit(0);

function pidsOnPort(port) {
  try {
    const output = execSync(`netstat -ano`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const localAddr = parts[1];
      const pid = parseInt(parts[parts.length - 1], 10);
      const lastColon = localAddr.lastIndexOf(':');
      if (lastColon === -1 || isNaN(pid) || pid <= 4) continue;
      if (parseInt(localAddr.slice(lastColon + 1), 10) === port) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

for (const port of ports) {
  for (const pid of pidsOnPort(port)) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      console.log(`[free_ports] reclaimed port ${port} from stray PID ${pid}`);
    } catch {
      // Already gone, or not ours to kill - either way, move on.
    }
  }
}
