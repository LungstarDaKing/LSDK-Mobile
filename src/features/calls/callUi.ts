// Is the call window shrunk to the small floating one? Shared by 1-to-1 and group calls (only one call exists at a time).
import { useSyncExternalStore } from 'react';

let minimized = false;
const subs = new Set<() => void>();
export const setMinimized = (v: boolean) => { if (v !== minimized) { minimized = v; subs.forEach((f) => f()); } };
export const isMinimized = () => minimized;
export function useMinimized(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => minimized, () => false);
}
