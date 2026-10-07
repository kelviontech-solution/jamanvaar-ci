import { useSyncExternalStore } from 'react';
import { AiConfig } from '@jamanvaar/business';

/** Subscribe to the full access revision, including catalogue and quota changes. */
export function useAiAccess() {
  useSyncExternalStore(
    (cb) => AiConfig.subscribe(cb),
    () => AiConfig.getRevision(),
    () => AiConfig.getRevision()
  );
  const state = AiConfig.getState();
  return {
    state,
    known: AiConfig.isKnown(),
    locked: state === 'LOCKED',
    showButton: (ownerWantsIt: boolean) => ownerWantsIt && (!AiConfig.isKnown() || AiConfig.shouldShowButton(ownerWantsIt))
  };
}
