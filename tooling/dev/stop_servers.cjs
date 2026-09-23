const { execSync } = require('child_process');

const TARGET_PORTS = [
  4000, // Cloud API
  5173, // Kiosk Admin
  5174, // Kiosk User
  5175, // POS Counter
  5176, // Restaurant Admin
  5177, // Captain App
  5178, // LAN Sync
  5179, // KDS
  5180, // Super Admin Web
  5181, // Super Admin Web (stray fallback port if 5180 was already taken)
  3000,
  5000,
  8000,
  8080,
];

console.log('================================================================');
console.log('          JAMANVAAR RESTAURANT OPERATING SYSTEM');
console.log('              Stop All Dev Servers Utility');
console.log('================================================================\n');

function getListeningProcesses() {
  try {
    const output = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = output.split('\n');
    const pidsByPort = new Map();

    for (const line of lines) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      // Format: TCP  [address]:[port]  [foreign]:*  LISTENING  [PID]
      if (parts.length >= 5) {
        const localAddr = parts[1];
        const pid = parseInt(parts[parts.length - 1], 10);
        const lastColon = localAddr.lastIndexOf(':');
        if (lastColon !== -1 && !isNaN(pid) && pid > 4) {
          const port = parseInt(localAddr.slice(lastColon + 1), 10);
          if (TARGET_PORTS.includes(port)) {
            if (!pidsByPort.has(port)) {
              pidsByPort.set(port, new Set());
            }
            pidsByPort.get(port).add(pid);
          }
        }
      }
    }
    return pidsByPort;
  } catch (err) {
    console.error('Error scanning ports:', err.message);
    return new Map();
  }
}

function stopServers() {
  const pidsByPort = getListeningProcesses();

  if (pidsByPort.size === 0) {
    console.log('✅ No development servers are currently running on target ports:');
    console.log(`   Ports: ${TARGET_PORTS.join(', ')}\n`);
    return;
  }

  let totalStopped = 0;
  for (const [port, pids] of pidsByPort.entries()) {
    for (const pid of pids) {
      try {
        console.log(`🛑 Stopping process on port ${port} (PID: ${pid})...`);
        if (process.platform === 'win32') {
          execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGKILL');
        }
        console.log(`   ✓ Successfully terminated PID ${pid} on port ${port}`);
        totalStopped++;
      } catch (err) {
        console.warn(`   ⚠️ Could not terminate PID ${pid} on port ${port}: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Completed! Stopped ${totalStopped} process(es).\n`);
}

stopServers();
