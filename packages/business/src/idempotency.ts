import { generateIdempotencyKey } from '@jamanvaar/utils';

export class IdempotencyManager {
  private static processedKeys = new Set<string>();

  public static isDuplicate(key: string): boolean {
    if (!key) return false;
    return this.processedKeys.has(key);
  }

  public static markProcessed(key: string): void {
    if (key) {
      this.processedKeys.add(key);
    }
  }

  public static createKey(prefix: string = 'ord'): string {
    return generateIdempotencyKey(prefix);
  }

  public static clear(): void {
    this.processedKeys.clear();
  }
}
