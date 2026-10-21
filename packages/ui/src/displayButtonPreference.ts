export interface DisplayButtonScope {
  application: string | (() => string);
  restaurantKey: string;
  subscribe?: (listener: () => void) => () => void;
}

const EVENT = 'jamanvaar-display-button-preference';
let scope: DisplayButtonScope | undefined;

export function configureDisplayButtonScope(next: DisplayButtonScope) {
  scope = next;
  notifyDisplayPreferenceScopeChange();
}

export function displayButtonPreferenceKey() {
  const application = scope
    ? typeof scope.application === 'function' ? scope.application() : scope.application
    : typeof location === 'undefined' ? 'app' : location.pathname.split('/').filter(Boolean)[0] || 'app';
  const restaurant = scope ? localStorage.getItem(scope.restaurantKey) : null;
  return `jamanvaar-display-button:v1:${encodeURIComponent(application)}:${encodeURIComponent(restaurant || 'unbound')}`;
}

// Include the scope in the snapshot so switching products/tenants refreshes subscribers
// even when both happen to have the same visibility value.
export function displayButtonSnapshot() {
  try {
    const key = displayButtonPreferenceKey();
    return `${key}:${localStorage.getItem(key) === 'off' ? 'off' : 'on'}`;
  } catch {
    return 'unavailable';
  }
}

export function notifyDisplayPreferenceScopeChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function subscribeDisplayButton(listener: () => void) {
  const unsubscribeScope = scope?.subscribe?.(listener);
  for (const event of [EVENT, 'storage', 'focus', 'popstate']) window.addEventListener(event, listener);
  return () => {
    unsubscribeScope?.();
    for (const event of [EVENT, 'storage', 'focus', 'popstate']) window.removeEventListener(event, listener);
  };
}

export function saveDisplayButtonVisibility(visible: boolean) {
  // A failed write must leave the launcher and toggle at their saved value.
  localStorage.setItem(displayButtonPreferenceKey(), visible ? 'on' : 'off');
  notifyDisplayPreferenceScopeChange();
}
