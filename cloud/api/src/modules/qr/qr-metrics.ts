import { Injectable } from '@nestjs/common';

/**
 * Per-instance, in-memory operating figures for the public QR endpoints: how many requests ended how, and how long the
 * recent ones took. Read through the platform-only runtime endpoint. They reset on restart and describe this instance only
 * (sum across instances for a fleet view); nothing here identifies a guest, a restaurant or a table.
 */
@Injectable()
export class QrMetrics {
  private readonly startedAt = Date.now();
  private readonly outcomes: Record<string, number> = {};
  private readonly recent: number[] = [];
  private cursor = 0;

  record(status: number, ms: number, kind: 'menu' | 'order' | 'other'): void {
    const klass = status === 429 ? '429' : status === 503 ? '503' : status === 409 ? '409' : `${Math.floor(status / 100)}xx`;
    const key = `${kind}:${klass}`;
    this.outcomes[key] = (this.outcomes[key] ?? 0) + 1;
    if (this.recent.length < 1000) this.recent.push(ms);
    else { this.recent[this.cursor] = ms; this.cursor = (this.cursor + 1) % 1000; }
  }

  snapshot() {
    const sorted = [...this.recent].sort((a, b) => a - b);
    const pick = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    return { uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000), outcomes: { ...this.outcomes }, latencyMs: { samples: sorted.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) } };
  }
}
