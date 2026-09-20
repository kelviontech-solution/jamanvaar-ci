import { useSyncExternalStore } from 'react';
import { AiConfig } from '@jamanvaar/business';

/**
 * What the cloud allows JAMAN AI to do for this restaurant (BUG-057), as React state. `showButton` applies
 * the owner's local "show the button" preference only to an ON feature: it can hide, never enable, and it
 * never hides the lock on a LOCKED one.
 */
export function useAiAccess() {
  const state = useSyncExternalStore(
    (cb) => AiConfig.subscribe(cb),
    () => AiConfig.getState(),
    () => AiConfig.getState()
  );
  return {
    state,
    locked: state === 'LOCKED',
    showButton: (ownerWantsIt: boolean) => AiConfig.shouldShowButton(ownerWantsIt)
  };
}
