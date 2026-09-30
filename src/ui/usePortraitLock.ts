import { useSyncExternalStore } from 'react';

/** Touch devices held in portrait. Gameplay is landscape-only (see README, "Supported orientation"). */
const QUERY = '(orientation: portrait) and (pointer: coarse)';

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', callback);
  return () => {
    media.removeEventListener('change', callback);
  };
}

export function usePortraitLock(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
