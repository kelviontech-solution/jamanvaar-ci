import { KeyValueStore } from '@jamanvaar/database';
import { SyncOutboxEngine } from './outbox';
import { syncMenuCatalog } from './menu_sync';

/**
 * Executes the commands the cloud has queued for this device (Kiosk Admin / Super Admin: sync now,
 * restart, diagnostics...). Only what the app can genuinely do is done; anything else is acknowledged
 * as FAILED ("not supported") so the sender is never told something happened that did not.
 * A command id is remembered once handled, so a redelivery after a crash is re-acknowledged, not re-run.
 */

export interface DeviceCommandRecord {
  id: string;
  commandType: string;
  payload?: unknown;
  /** Present on commands delivered by a Branch Core (see command_signing.ts). */
  signature?: string;
}

export interface CommandOutcome {
  status: 'SUCCEEDED' | 'FAILED';
  result?: Record<string, unknown>;
  error?: string;
}

export interface CommandIo {
  list(): Promise<DeviceCommandRecord[]>;
  ack(id: string, outcome: CommandOutcome): Promise<void>;
}

type Handler = (cmd: DeviceCommandRecord) => Promise<Record<string, unknown> | void>;

const DONE_KEY = 'jamanvaar_device_commands_done';
const DONE_LIMIT = 200;

/** Applied by the heartbeat gate itself (DeviceGate reads the lock/revoke decision), so there is nothing more to execute. */
const HEARTBEAT_APPLIED = new Set(['LOCK', 'UNLOCK', 'DISABLE_DEVICE', 'ENABLE_DEVICE', 'REVOKE_AUTH']);

function readDone(): string[] {
  try {
    return JSON.parse(KeyValueStore.get(DONE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeDone(ids: string[]): void {
  try {
    KeyValueStore.set(DONE_KEY, JSON.stringify(ids.slice(-DONE_LIMIT)));
  } catch {
    // Without storage a redelivered command may run again; the commands supported here are safe to repeat.
  }
}

export class DeviceCommandRunner {
  private static handlers = new Map<string, Handler>();
  private static running = false;
  private static afterAcknowledgement = new Map<string, () => void | Promise<void>>();
  private static recheck = new Set<string>();
  private static afterAttempt = new Map<string, () => void>();
  static registerAfterAttempt(type: string, handler: () => void): void { this.afterAttempt.set(type, handler); }

  static registerAfterAcknowledgement(type: string, handler: () => void | Promise<void>): void { this.afterAcknowledgement.set(type, handler); }

  static registerHandler(type: string, handler: Handler, options: { recheckBeforeAcknowledgement?: boolean } = {}): void {
    this.handlers.set(type, handler);
    if (options.recheckBeforeAcknowledgement) this.recheck.add(type); else this.recheck.delete(type);
  }

  static reset(): void {
    this.handlers.clear();
    this.running = false;
    this.afterAcknowledgement.clear();
    this.recheck.clear();
    this.afterAttempt.clear();
  }

  /** Built-in handlers every app shares. Apps may override or add more with registerHandler. */
  static registerDefaults(): void {
    if (!this.handlers.has('REQUEST_SYNC')) {
      this.registerHandler('REQUEST_SYNC', async (cmd) => {
        const scope = String((cmd.payload as { scope?: string } | undefined)?.scope ?? 'ALL').toUpperCase();
        if (scope === 'MENU') {
          await syncMenuCatalog({ push: false });
          return { scope };
        }
        const pushed = await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
        const pulled = await SyncOutboxEngine.catchUpFromCloud();
        return { scope, ...pushed, ...pulled };
      });
    }
    if (!this.handlers.has('REQUEST_HEALTH')) {
      this.registerHandler('REQUEST_HEALTH', async () => ({ ...SyncOutboxEngine.getSyncStats() }));
    }
    if (!this.handlers.has('REQUEST_DIAGNOSTICS')) {
      this.registerHandler('REQUEST_DIAGNOSTICS', async () => ({
        ...SyncOutboxEngine.getSyncStats(),
        online: typeof navigator === 'undefined' ? null : navigator.onLine,
        at: new Date().toISOString()
      }));
    }
    if (!this.handlers.has('RESTART_APP')) {
      this.registerHandler('RESTART_APP', async () => {
        // Reload after the acknowledgement has had a moment to go out.
        setTimeout(() => (globalThis as { location?: { reload(): void } }).location?.reload(), 1500);
        return { restartingInMs: 1500 };
      });
    }
  }

  /** `verify` returns false for a command that must not run (e.g. a forged LAN command); it is refused and acknowledged as FAILED. */
  static async run(io: CommandIo, verify?: (cmd: DeviceCommandRecord) => Promise<boolean>): Promise<{ executed: number; failed: number }> {
    if (this.running) return { executed: 0, failed: 0 };
    this.running = true;
    let executed = 0;
    let failed = 0;
    try {
      let commands: DeviceCommandRecord[];
      try {
        commands = await io.list();
      } catch {
        return { executed: 0, failed: 0 };
      }
      const done = readDone();
      for (const cmd of commands) {
        let outcome: CommandOutcome;
        const alreadyDone = done.includes(cmd.id);
        if (!alreadyDone && verify && !(await verify(cmd))) {
          outcome = { status: 'FAILED', error: 'Command signature is missing or invalid; refused' };
        } else if (alreadyDone) {
          if (this.recheck.has(cmd.commandType)) {
            try { outcome = { status: 'SUCCEEDED', result: (await this.handlers.get(cmd.commandType)?.(cmd) ?? {}) as Record<string, unknown> }; }
            catch (error) { outcome = { status: 'FAILED', error: error instanceof Error ? error.message : 'Command is no longer safe to complete' }; }
          } else outcome = { status: 'SUCCEEDED', result: { note: 'already executed' } };
        } else if (HEARTBEAT_APPLIED.has(cmd.commandType)) {
          outcome = { status: 'SUCCEEDED', result: { note: 'applied through the device heartbeat' } };
        } else {
          const handler = this.handlers.get(cmd.commandType);
          if (!handler) {
            outcome = { status: 'FAILED', error: `${cmd.commandType} is not supported by this app` };
          } else {
            try {
              const result = await handler(cmd);
              outcome = { status: 'SUCCEEDED', result: (result ?? {}) as Record<string, unknown> };
            } catch (err) {
              outcome = { status: 'FAILED', error: err instanceof Error ? err.message : 'Command failed' };
            }
          }
          if (outcome.status === 'SUCCEEDED') {
            done.push(cmd.id);
            writeDone(done);
          }
        }
        if (!alreadyDone) {
          if (outcome.status === 'SUCCEEDED') executed++;
          else failed++;
        }
        try {
          await io.ack(cmd.id, outcome);
          if (outcome.status === 'SUCCEEDED') await this.afterAcknowledgement.get(cmd.commandType)?.();
        } catch {
          // Redelivered commands are re-acknowledged; destructive handlers recheck safety first.
        } finally { this.afterAttempt.get(cmd.commandType)?.(); }
      }
    } finally {
      this.running = false;
    }
    return { executed, failed };
  }
}
