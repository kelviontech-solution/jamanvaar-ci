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
  private waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly worker: WorkerLike,
    private readonly name: string
  ) {
    worker.onmessage = (e) => {
      const w = this.waiting.get(e.data.id);
      if (!w) return;
      this.waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data);
      else w.reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
    };
    worker.onerror = (e) => {
      const err = new Error(e.message ?? 'SQLite worker failed');
      this.waiting.forEach((w) => w.reject(err));
      this.waiting.clear();
    };
  }

  private call(msg: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...msg });
    });
  }

  async load(): Promise<Record<string, string>> {
    return (await this.call({ type: 'open', name: this.name })).data;
  }

  async write(ops: StoreOp[]): Promise<void> {
    await this.call({ type: 'write', ops });
  }

  close(): void {
    void this.call({ type: 'close' }).finally(() => this.worker.terminate());
  }
}
