import { useEffect, useState } from 'react';
import { signedUrl } from './storage';

/** Resolve a private-bucket path to a short-lived URL (cached). Returns null while loading or on failure. */
export function useSignedUrl(bucket: 'media' | 'avatars' | 'stories', path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null); setFailed(false);
    if (!path) return;
    void signedUrl(bucket, path).then((u) => { if (!alive) return; if (u) setUrl(u); else setFailed(true); });
    return () => { alive = false; };
  }, [bucket, path]);
  return { url, failed };
}
