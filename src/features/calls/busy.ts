// A person can be in one call at a time: the 1-to-1 manager and the group manager each report here, and each refuses to start while the other is busy.
const busy = new Set<string>();
export const setBusy = (who: 'one' | 'group', on: boolean) => { if (on) busy.add(who); else busy.delete(who); };
export const isBusyWith = (other: 'one' | 'group') => busy.has(other);
export const _resetBusy = () => busy.clear();
