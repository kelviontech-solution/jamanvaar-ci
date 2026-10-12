import { generateUUID } from '@jamanvaar/utils';

export type TerminalRole = 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK_USER' | 'KIOSK_ADMIN';
const prefixes: Record<TerminalRole, string> = {
  POS: 'jamanvaar_pos', POS_ADMIN: 'jamanvaar_cloud', CAPTAIN: 'jamanvaar_captain',
  KDS: 'jamanvaar_kds', KIOSK_USER: 'jamanvaar_kiosk_user', KIOSK_ADMIN: 'jamanvaar_cloud',
};
const memory = new Map<TerminalRole, string>();
export function getTerminalLabel(role: TerminalRole): string {
  try {const label=globalThis.localStorage?.getItem(`${prefixes[role]}_device_label`);if (label) return label;} catch {}
  return {POS:'Counter POS',POS_ADMIN:'Restaurant Admin',CAPTAIN:'Captain device',KDS:'Kitchen display',KIOSK_USER:'Customer kiosk',KIOSK_ADMIN:'Kiosk Admin'}[role];
}

/** Record identity, never a subscription/authorization decision. Preserve cloud activation IDs. */
export function getTerminalId(role: TerminalRole): string {
  try {
    const activated = globalThis.localStorage?.getItem(`${prefixes[role]}_device_id`);
    if (activated) return activated;
    const key = `jamanvaar_local_terminal_${role.toLowerCase()}`;
    const saved = globalThis.localStorage?.getItem(key);
    if (saved) return saved;
    const created = memory.get(role) ?? `${role}-${generateUUID()}`;
    memory.set(role, created);
    globalThis.localStorage?.setItem(key, created);
    return created;
  } catch {
    if (!memory.has(role)) memory.set(role, `${role}-${generateUUID()}`);
    return memory.get(role)!;
  }
}
