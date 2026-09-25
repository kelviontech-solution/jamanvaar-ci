import { backoffDelayMs } from './sync_protocol';

/**
 * Listens to the cloud's realtime stream (server-sent events) so a device hears about changes within a
 * second instead of waiting for its next poll. An event only says "pull now": the actual data always
 * comes from the cursor-based pull, so a missed or duplicated event can never lose or repeat a change.
 * The polling loops stay in place as the fallback whenever this connection is down.
 */

export interface SseEvent {
  event: string;
  data: any;
}

/** Splits buffered text into complete SSE events, returning what is left over (a partial event). */
export function parseSseBlocks(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (!block.trim() || block.startsWith(':')) continue;
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
    const raw = /^data: (.*)$/m.exec(block)?.[1];
    let data: any = null;
    if (raw !== undefined) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }
    events.push({ event, data });
  }
  return { events, rest };
}

export interface RealtimeOptions {
  apiBase: string;
  deviceToken: string;
  onChange(kind: string): void;
  onCommand(): void;
  onRevoked?(): void;
  /** Bursts of the same change kind within this window become a single wake-up. */
  debounceMs?: number;
  fetchImpl?: typeof fetch;
  sleep?(ms: number): Promise<void>;
}

export class RealtimeClient {
  private running = false;
  private controller: AbortController | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly opts: RealtimeOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private sleep(ms: number): Promise<void> {
    return this.opts.sleep ? this.opts.sleep(ms) : new Promise((r) => setTimeout(r, ms));
  }

  private wake(kind: string): void {
    const wait = this.opts.debounceMs ?? 300;
    if (this.timers.has(kind)) return;
    this.timers.set(
      kind,
      setTimeout(() => {
        this.timers.delete(kind);
        if (this.running) this.opts.onChange(kind);
      }, wait)
    );
  }

  private async loop(): Promise<void> {
    let attempt = 0;
    while (this.running) {
      let connected = false;
      try {
        this.controller = new AbortController();
        const doFetch = this.opts.fetchImpl ?? fetch;
        const res = await doFetch(`${this.opts.apiBase}/api/v1/realtime/stream`, {
          headers: { Authorization: `Bearer ${this.opts.deviceToken}`, Accept: 'text/event-stream' },
          signal: this.controller.signal
        });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseBlocks(buffer);
            buffer = parsed.rest;
            for (const ev of parsed.events) {
              if (ev.event === 'ready') {
                connected = true;
                attempt = 0;
              } else if (ev.event === 'change') {
                this.wake(String(ev.data?.kind ?? 'orders'));
              } else if (ev.event === 'command') {
                this.opts.onCommand();
              } else if (ev.event === 'revoked') {
                this.running = false;
                this.opts.onRevoked?.();
                return;
              }
            }
          }
        }
      } catch {
        // dropped or aborted: fall through to reconnect (or exit if stopped)
      }
      if (!this.running) return;
      attempt = connected ? 1 : attempt + 1;
      await this.sleep(backoffDelayMs(attempt));
    }
  }
}
