import type React from 'react';
import type { AppCode } from '../cloud/cloudClient';

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
export function filterNavSections<T extends GatedNavItem>(sections: Array<GatedNavSection<T>>, hasApp: (app: AppCode) => boolean): Array<GatedNavSection<T>> {
  return sections
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (!item.requiresApp || hasApp(item.requiresApp)) && (!item.requiresAnyApp || item.requiresAnyApp.some(hasApp)))
    }))
    .filter((group) => group.items.length > 0);
}
