import { useSyncExternalStore } from "react";

// ── which groups would take the node that is being dragged ───────────────────

let receiving: ReadonlySet<string> = new Set();
const receivingListeners = new Set<() => void>();
const subscribeReceiving = (listener: () => void): (() => void) => {
  receivingListeners.add(listener);
  return () => void receivingListeners.delete(listener);
};
export function setReceiving(next: ReadonlySet<string>): void {
  if (next.size === receiving.size && [...next].every((id) => receiving.has(id))) return;
  receiving = next;
  for (const listener of [...receivingListeners]) listener();
}

/** true while a node is dragged that would join the group `id` if it were dropped now */
export function useReceiving(id: string): boolean {
  return useSyncExternalStore(subscribeReceiving, () => receiving.has(id));
}
