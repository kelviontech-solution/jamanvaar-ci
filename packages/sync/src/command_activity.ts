/**
 * The outcome of the most recent remote command this terminal attempted (Super Admin / Restaurant
 * Admin dispatch), so a terminal's own UI can show "Request Sync completed" instead of leaving
 * silent commands (Request Sync, Health, Diagnostics) with zero visible effect. Without this, a
 * command that genuinely ran successfully looked identical, from the terminal's screen, to one that
 * was never delivered at all -- there was no way to tell them apart by watching the app.
 */
export interface CommandActivityEvent {
  commandType: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
  at: string;
}

export class CommandActivity {
  private static current: CommandActivityEvent | null = null;
  private static listeners = new Set<() => void>();

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  static get(): CommandActivityEvent | null {
    return this.current;
  }

  static report(commandType: string, outcome: { status: 'SUCCEEDED' | 'FAILED'; error?: string }): void {
    this.current = { commandType, status: outcome.status, error: outcome.error, at: new Date().toISOString() };
    this.listeners.forEach((fn) => fn());
  }

  static reset(): void {
    this.current = null;
  }
}
