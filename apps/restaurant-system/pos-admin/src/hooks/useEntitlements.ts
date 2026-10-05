import React, { useEffect, useState } from 'react';
import { fetchMyEnabledApps, type AppCode } from '../cloud/cloudClient';

export interface GatedNavItem {
  id: string;
  /** When set, this item is hidden unless the restaurant's enabled apps include it. */
  requiresApp?: AppCode;
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
      items: group.items.filter((item) => !item.requiresApp || hasApp(item.requiresApp))
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
export function useEntitlements(refreshKey?: unknown): { hasApp: (app: AppCode) => boolean; loading: boolean; refetch: () => void } {
  const [enabledApps, setEnabledApps] = useState<AppCode[] | null>(null);

  const load = () => {
    fetchMyEnabledApps()
      .then((apps) => setEnabledApps(apps))
      .catch(() => {
        // Fail closed: an error hides gated tabs rather than guessing them open.
        setEnabledApps([]);
      });
  };

  useEffect(() => {
    let cancelled = false;
    fetchMyEnabledApps()
      .then((apps) => {
        if (!cancelled) setEnabledApps(apps);
      })
      .catch(() => {
        if (!cancelled) setEnabledApps([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return {
    loading: enabledApps === null,
    hasApp: (app: AppCode) => (enabledApps ?? []).includes(app),
    refetch: load
  };
}
