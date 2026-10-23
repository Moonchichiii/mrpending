import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

// Read, never stored: the cameo and the sloth's blink only start when the user allows motion.
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
