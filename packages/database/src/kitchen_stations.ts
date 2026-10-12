import { db } from './db';
import { KeyValueStore } from './key_value_store';

export interface KitchenStation { id: string; name: string; aliases: string[] }
const normalized = (name: string) => name.trim().toLocaleLowerCase();
const key = () => `kitchen-stations:${JSON.stringify([KeyValueStore.get('jamanvaar_tenant_id') || db.restaurant.id, KeyValueStore.get('jamanvaar_bound_branch_id') || db.outlet.id])}`;
/** Names are display copy. Routing uses immutable IDs and explicitly recorded old names. */
export class KitchenStationRepository {
  static list(): KitchenStation[] { try { return JSON.parse(KeyValueStore.get(key()) || '[]'); } catch { return []; } }
  static resolve(value: string): KitchenStation | undefined {
    return this.list().find(row => row.id === value || [row.name, ...row.aliases].some(name => normalized(name) === normalized(value)));
  }
  static matches(value: string | undefined, selected: string): boolean {
    if (!value) return false;
    const row = this.resolve(selected);
    return row ? this.resolve(value)?.id === row.id : normalized(value) === normalized(selected);
  }
  static ensure(name: string): KitchenStation {
    const existing = this.resolve(name);
    if (existing) return existing;
    const clean = name.trim();
    if (!clean || clean.length > 100) throw new Error('Enter a station name of 1–100 characters.');
    const row = { id: crypto.randomUUID(), name: clean, aliases: [] };
    this.apply([...this.list(), row]);
    return row;
  }
  static rename(id: string, name: string, aliases: string[]): void {
    const rows = this.list();
    const row = rows.find(item => item.id === id);
    if (!row) throw new Error('Station no longer exists. Refresh the list.');
    this.apply(rows.map(item => item.id !== id ? item : { ...item, name: name.trim(), aliases: [...new Set([...aliases.map(value => value.trim()).filter(Boolean), row.name])].filter(value => normalized(value) !== normalized(name)) }));
  }
  static apply(rows: KitchenStation[]): void {
    const names = new Set<string>(); const ids = new Set<string>();
    if (rows.length > 100) throw new Error('A branch supports up to 100 stations.');
    for (const row of rows) {
      if (!row.id || ids.has(row.id) || !row.name.trim() || row.name.length > 100 || row.aliases.length > 30) throw new Error('Invalid kitchen station.');
      ids.add(row.id);
      for (const name of [row.name, ...row.aliases]) {
        const value = normalized(name);
        if (!value || name.length > 100 || names.has(value)) throw new Error('Station names and aliases must be unique within the branch.');
        names.add(value);
      }
    }
    KeyValueStore.set(key(), JSON.stringify(rows));
    for (const ticket of db.kots) {
      const row = rows.find(item => [item.name, ...item.aliases].some(name => normalized(name) === normalized(ticket.station || '')));
      if (row && !ticket.stationId) ticket.stationId = row.id;
    }
    db.notify();
  }
}
