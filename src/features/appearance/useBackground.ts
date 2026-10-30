import { useEffect, useState } from 'react';
import { DEFAULTS, loadPrefs, subscribePrefs, type Prefs } from './backgrounds';

export function useBgPrefs(): Prefs {
  const [p, setP] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    let alive = true;
    void loadPrefs().then((x) => { if (alive) setP(x); });
    const off = subscribePrefs((x) => { if (alive) setP(x); });
    return () => { alive = false; off(); };
  }, []);
  return p;
}
