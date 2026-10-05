import { useEffect, useState } from 'react';
import { fetchMyEnabledApps, type AppCode } from '../cloud/cloudClient';

export interface GatedNavItem {
  id: string;
  /** When set, this item is hidden unless the restaurant's enabled apps include it. */
  requiresApp?: AppCode;
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

export function useEntitlements(): { hasApp: (app: AppCode) => boolean; loading: boolean } {
  const [enabledApps, setEnabledApps] = useState<AppCode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyEnabledApps()
      .then((apps) => {
        if (!cancelled) setEnabledApps(apps);
      })
      .catch(() => {
        // Fail closed: an error hides gated tabs rather than guessing them open.
        if (!cancelled) setEnabledApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading: enabledApps === null,
    hasApp: (app: AppCode) => (enabledApps ?? []).includes(app)
  };
}
