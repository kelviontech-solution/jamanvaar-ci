import type { StoreOp } from './sql_kv_engine';
import type { StorageBackend } from './durable_storage';

export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: any }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

/** Talks to the SQLite worker. Each request is answered by id, so writes complete in the order they were sent. */
export class WorkerBackend implements StorageBackend {
  private nextId = 1;
  private waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;

  constructor(
    private readonly worker: WorkerLike,
    private readonly name: string,
    private readonly timeoutMs = 10_000
  ) {
    worker.onmessage = (e) => {
      const w = this.waiting.get(e.data.id);
      if (!w) return;
      this.waiting.delete(e.data.id);
      clearTimeout(w.timer);
      if (e.data.ok) w.resolve(e.data);
      else w.reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
    };
    worker.onerror = (e) => {
      const err = new Error(e.message ?? 'SQLite worker failed');
      this.waiting.forEach((w) => { clearTimeout(w.timer); w.reject(err); });
      this.waiting.clear();
      this.close();
    };
  }

  private call(msg: Record<string, unknown>): Promise<any> {
    if (this.closed) return Promise.reject(new Error('SQLite worker is closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`SQLite worker did not finish ${msg.type} within ${this.timeoutMs}ms`));
        this.close();
      }, this.timeoutMs);
      this.waiting.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, ...msg }); }
      catch (error) { clearTimeout(timer); this.waiting.delete(id); reject(error); }
    });
  }

  async load(): Promise<Record<string, string>> {
    return (await this.call({ type: 'open', name: this.name })).data;
  }

  async write(ops: StoreOp[]): Promise<void> {
    await this.call({ type: 'write', ops });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.waiting.forEach((w) => { clearTimeout(w.timer); w.reject(new Error('SQLite worker closed')); });
    this.waiting.clear();
    this.worker.terminate();
  }
}
