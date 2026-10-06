import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloudApiError, fetchMyEnabledApps, type AppCode } from '../cloud/cloudClient';

export interface GatedNavItem {
  id: string;
  /** When set, this item is hidden unless the restaurant's enabled apps include it. */
  requiresApp?: AppCode;
  requiresAnyApp?: AppCode[];
}

/** A real sidebar nav item: GatedNavItem plus the label/icon the UI actually renders. */
export interface NavSectionItem extends GatedNavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface GatedNavSection<T extends GatedNavItem> {
  section: string;
  items: T[];
}

/**
 * The one place the "is this nav item visible" decision is made — a pure, generic function so it
 * can be tested directly (without rendering the app shell or any component-test infrastructure)
 * while preserving each real nav item's own shape (icon component, labels, etc.) for the caller.
 * An item with no requiresApp is always kept; one with requiresApp is kept only when hasApp says
 * so. A section left with zero visible items is dropped entirely, not shown empty.
 */
export function filterNavSections<T extends GatedNavItem>(
  sections: Array<GatedNavSection<T>>,
  hasApp: (app: AppCode) => boolean
): Array<GatedNavSection<T>> {
  return sections
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (!item.requiresApp || hasApp(item.requiresApp)) && (!item.requiresAnyApp || item.requiresAnyApp.some(hasApp)))
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * `refreshKey` lets the caller force a re-fetch — required because this hook mounts as part of
 * the whole app shell, which happens before a fresh device activation has a token at all. A
 * `useEffect([])` fetch taken at that moment always 401s and (found via live verification) never
 * retries, so the Kiosk tab (or any gated section) stayed hidden until a full page reload. Pass a
 * value that changes when auth state does (e.g. `cloudConnected`) — mirrors how this app already
 * re-fetches `refreshCloudEntitlementsIntoLicense` keyed on that same signal.
 */
export function useEntitlements(refreshKey?: unknown, enabled = true): { enabledApps: AppCode[]; hasApp: (app: AppCode) => boolean; loading: boolean; error: string | null; authRequired: boolean; refetch: () => void } {
  const [enabledApps, setEnabledApps] = useState<AppCode[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<unknown>(Symbol('not loaded'));
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);

  const load = useCallback(() => setRevision(n => n + 1), []);

  useEffect(() => { setEnabledApps(null); setError(null); setAuthRequired(false); }, [refreshKey]);

  useEffect(() => {
    if (!enabled) { setEnabledApps([]); setLoadedKey(refreshKey); return; }
    let cancelled = false;
    const requestGeneration = ++generation.current;
    fetchMyEnabledApps()
      .then((apps) => {
        if (!cancelled && requestGeneration === generation.current) {
          setEnabledApps(previous => previous && previous.length === apps.length && previous.every(app => apps.includes(app)) ? previous : apps);
          setError(null);
          setAuthRequired(false);
          setLoadedKey(refreshKey);
        }
      })
      .catch((err) => {
        if (!cancelled && requestGeneration === generation.current) {
          const denied = err instanceof CloudApiError && (err.status === 401 || err.status === 403);
          setEnabledApps([]); // Fail closed, with explicit recovery instead of implying an empty plan.
          setAuthRequired(denied);
          setError(denied ? 'Your cloud session has expired. Sign in again to restore your restaurant modules.' : 'Restaurant modules could not be loaded. Check your connection and try again.');
          setLoadedKey(refreshKey);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, revision, enabled]);

  const hasApp = useCallback((app: AppCode) => enabled && loadedKey === refreshKey && (enabledApps ?? []).includes(app), [enabledApps, loadedKey, refreshKey, enabled]);

  return {
    enabledApps: loadedKey === refreshKey ? enabledApps ?? [] : [],
    loading: enabledApps === null || loadedKey !== refreshKey,
    error: loadedKey === refreshKey ? error : null,
    authRequired: loadedKey === refreshKey && authRequired,
    hasApp,
    refetch: load
  };
}
