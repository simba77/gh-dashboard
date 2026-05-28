import { useMemo, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../db/projectItems';
import { getItemsSnapshot, subscribeItems } from './itemStore';

// Selector hook for widgets — returns the filtered & projected view they
// need, recomputed only when the underlying snapshot changes. Pass a stable
// `selector` (define outside the component or memoise it) so the returned
// array reference is stable across renders that don't change inputs.
export function useItems<T>(selector: (rows: ProjectItemRow[]) => T, deps: unknown[]): T {
  const snapshot = useSyncExternalStore(subscribeItems, getItemsSnapshot);
  // Map -> array once per snapshot change. Cheap relative to the selector
  // work the caller does on top.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => selector(Array.from(snapshot.values())), [snapshot, ...deps]);
}
