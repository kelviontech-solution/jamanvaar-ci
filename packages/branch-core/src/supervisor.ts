import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';

/**
 * Keeps the Branch Core running. A core that stopped silently would drop the whole branch to "no shared
 * server", so the supervisor restarts it whenever it exits or stops answering, with a growing pause
 * between attempts (reset once it has stayed up), and writes a size-capped log.
 *
 * Starting the supervisor at boot is an operating-system registration step and belongs to packaging; the
 * restart, health-watchdog and logging behaviour lives here and is testable now.
 */
export interface SupervisorOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Fetches the core's /health; the watchdog kills a child that stops answering. */
  healthUrl?: string;
  healthEveryMs?: number;
  healthFailuresBeforeRestart?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** A run at least this long counts as healthy and resets the backoff. */
  stableAfterMs?: number;
  logFile?: string;
  logMaxBytes?: number;
  log?: (line: string) => void;
}

export class Supervisor {
  private child: ChildProcess | null = null;
  private stopped = false;
  private backoff: number;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  restarts = 0;

  constructor(private o: SupervisorOptions) {
    this.backoff = o.minBackoffMs ?? 1000;
  }

  private write(line: string): void {
    const text = `${new Date().toISOString()} ${line}`;
    this.o.log?.(text);
    if (!this.o.logFile) return;
    try {
      if (existsSync(this.o.logFile) && statSync(this.o.logFile).size > (this.o.logMaxBytes ?? 2_000_000)) {
        rmSync(`${this.o.logFile}.1`, { force: true });
        renameSync(this.o.logFile, `${this.o.logFile}.1`);
      }
      appendFileSync(this.o.logFile, `${text}\n`);
    } catch {
      // logging must never take the supervisor down
    }
  }

  start(): void {
    this.stopped = false;
    this.launch();
  }

  private launch(): void {
    if (this.stopped) return;
    this.startedAt = Date.now();
    this.failures = 0;
    const child = spawn(this.o.command, this.o.args, { env: { ...process.env, ...this.o.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stdout?.on('data', (d) => this.write(String(d).trimEnd()));
    child.stderr?.on('data', (d) => this.write(`ERR ${String(d).trimEnd()}`));
    child.on('error', (e) => this.write(`could not start: ${e.message}`));
    child.on('exit', (code, signal) => {
      this.child = null;
      if (this.stopped) return;
      const ranFor = Date.now() - this.startedAt;
      if (ranFor >= (this.o.stableAfterMs ?? 30_000)) this.backoff = this.o.minBackoffMs ?? 1000;
      this.write(`exited (${signal ?? code}) after ${ranFor}ms; restarting in ${this.backoff}ms`);
      this.restarts++;
      this.timer = setTimeout(() => this.launch(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, this.o.maxBackoffMs ?? 60_000);
    });
    this.watch();
  }

  private watch(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    if (!this.o.healthUrl) return;
    this.watchdog = setInterval(async () => {
      if (!this.child) return;
      try {
        const res = await fetch(this.o.healthUrl as string, { signal: AbortSignal.timeout(3000) });
        this.failures = res.ok ? 0 : this.failures + 1;
      } catch {
        this.failures++;
      }
      if (this.failures >= (this.o.healthFailuresBeforeRestart ?? 3) && this.child) {
        this.write(`health check failed ${this.failures} times; restarting the core`);
        this.failures = 0;
        this.child.kill();
      }
    }, this.o.healthEveryMs ?? 10_000);
    this.watchdog.unref?.();
  }

  stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
  }
}
