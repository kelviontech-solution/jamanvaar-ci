import { useRef } from 'react';

/**
 * Simultaneous-edit detection for the local-first admin editors (ItemModal, CategoryModal, ...).
 * No editable record carries a `version` field -- updateMenuItem/updateCategory already bump
 * `updatedAt` unconditionally on every write, so that's reused as the conflict key instead of
 * adding a new field: snapshot it when the editor opens, compare it against the LIVE record
 * right before saving. A mismatch means another device or tab changed this record (via LAN mesh
 * or cloud sync) while this editor was open.
 */
export function useEditConflictGuard<T extends { updatedAt?: string }>() {
  const baseline = useRef<{ id: string; updatedAt?: string } | null>(null);

  function snapshot(id: string, record: T | null | undefined): void {
    baseline.current = record ? { id, updatedAt: record.updatedAt } : null;
  }

  function check(id: string, getLive: () => T | null | undefined): { conflicted: boolean; live: T | null } {
    const live = getLive() ?? null;
    if (!baseline.current || baseline.current.id !== id) return { conflicted: false, live };
    // The record existed when the editor opened but is gone now (archived/deleted elsewhere) --
    // there is nothing safe to silently overwrite.
    if (!live) return { conflicted: true, live };
    return { conflicted: (live.updatedAt ?? '') !== (baseline.current.updatedAt ?? ''), live };
  }

  return { snapshot, check };
}
