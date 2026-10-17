import { useEffect, useRef, useState } from 'react';
import { Modal } from '@jamanvaar/ui';
import { db, KeyValueStore, KioskConfigurationRepository } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { QR_BEFORE_NAVIGATE } from '../qrconsole/useQrUnsavedChanges';

function compatible(sample: unknown, value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (sample === undefined || sample === null) return value === null || value === undefined || ['string', 'number', 'boolean', 'object'].includes(typeof value);
  if (Array.isArray(sample)) return Array.isArray(value) && value.length <= 1000 && (!sample.length || value.every((v) => compatible(sample[0], v, depth + 1)));
  if (typeof sample === 'object')
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.entries(sample).every(([key, v]) => compatible(v, (value as Record<string, unknown>)[key], depth + 1))
    );
  return typeof sample === typeof value && (typeof value !== 'number' || Number.isFinite(value));
}

/** Presentation drafts only. Never pass payment credentials or activation keys. */
export function useKioskDraft<T>({
  scope,
  value,
  dirty,
  restore,
  discard
}: {
  scope: string;
  value: T;
  dirty: boolean;
  restore: (value: T) => void;
  discard: () => void;
}) {
  const key = `kiosk-draft:v1:${db.restaurant.id}:${KeyValueStore.get('jamanvaar_bound_branch_id') || 'none'}:${SessionPersistence.load('admin')?.userId || 'owner'}:${scope}`;
  const latest = useRef({ value, dirty, restore, discard });
  latest.current = { value, dirty, restore, discard };
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);
  const [saved, setSaved] = useState<T | null>(null),
    [notice, setNotice] = useState(''),
    [olderVersion, setOlderVersion] = useState(false);
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  const save = () => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ savedAt: new Date().toISOString(), baseVersion: KioskConfigurationRepository.snapshot().updatedAt, value: latest.current.value })
      );
      setNotice('Draft saved on this device. It is not published.');
      return true;
    } catch {
      setNotice('Cannot save a draft on this device. Keep editing or discard explicitly.');
      return false;
    }
  };
  useEffect(() => {
    try {
      const entry = JSON.parse(localStorage.getItem(key) || 'null');
      if (entry && compatible(latest.current.value, entry.value)) {
        setSaved(entry.value);
        setOlderVersion(entry.baseVersion !== KioskConfigurationRepository.snapshot().updatedAt);
      } else {
        setSaved(null);
        if (entry) setNotice('The saved draft does not match this editor. Your current settings have been preserved.');
      }
    } catch {
      setSaved(null);
    }
  }, [key]);
  useEffect(() => {
    const before = (event: Event) => {
      if (latest.current.dirty) event.preventDefault();
    };
    const leave = (event: Event) => {
      if (!latest.current.dirty) return;
      const resolve = (event as CustomEvent<{ resolve: (ok: boolean) => void }>).detail.resolve;
      setPending(() => resolve);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!latest.current.dirty) return;
      save();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener(QR_BEFORE_NAVIGATE, before);
    window.addEventListener('jamanvaar-qr-request-leave', leave);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener(QR_BEFORE_NAVIGATE, before);
      window.removeEventListener('jamanvaar-qr-request-leave', leave);
      window.removeEventListener('beforeunload', unload);
    };
  }, [key]);
  const finish = (ok: boolean) => {
    pending?.(ok);
    setPending(null);
  };
  const button = 'min-h-11 rounded-xl border px-4 py-2 font-bold text-sm';
  return {
    clear,
    save,
    ui: (
      <>
        {dirty && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
            <span className="text-sm">Unpublished changes</span>
            <button type="button" className={button} onClick={() => save()}>
              Save draft on this device
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm">
            {notice}
          </p>
        )}
        <Modal
          isOpen={saved !== null}
          onClose={() => setSaved(null)}
          title="Restore your saved draft?"
          footer={
            <div className="flex flex-wrap gap-3">
              <button
                className={button}
                onClick={() => {
                  clear();
                  setSaved(null);
                }}
              >
                Discard saved draft
              </button>
              <button
                className={button}
                onClick={() => {
                  if (saved !== null) latest.current.restore(saved);
                  setSaved(null);
                }}
              >
                Restore preview
              </button>
            </div>
          }
        >
          <p>This draft is saved only on this device for this restaurant, branch and editor. Review it before publishing.</p>
          {olderVersion && (
            <p className="mt-3 text-amber-900">
              Published settings changed since this draft was saved. Compare the restored preview carefully before applying it.
            </p>
          )}
        </Modal>
        <Modal
          isOpen={!!pending}
          onClose={() => finish(false)}
          title="Keep your unfinished changes?"
          footer={
            <div className="flex flex-wrap gap-3">
              <button className={button} onClick={() => finish(false)}>
                Keep editing
              </button>
              <button
                className={button}
                onClick={() => {
                  clear();
                  latest.current.discard();
                  finish(true);
                }}
              >
                Discard changes
              </button>
              <button
                className={button}
                onClick={() => {
                  if (save()) finish(true);
                }}
              >
                Save draft & leave
              </button>
            </div>
          }
        >
          <p>Your preview has not been published. Save a draft to continue later on this device.</p>
        </Modal>
      </>
    )
  };
}
