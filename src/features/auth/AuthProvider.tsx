import { wipeLists } from '@/features/stickers/store';
import { signedIn } from './access';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { wipeTurns } from '@/features/lunex/store';
import { supabase } from '@/lib/supabase';

type Profile = { id: string; username: string; terms_version: string | null; bio: string | null; avatar_path: string | null };
type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  needsConsent: boolean;
  refreshProfile: () => Promise<void>;
  markTermsAccepted: (version: string) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileFor, setProfileFor] = useState<string | null>(null);   // which user id the loaded profile belongs to

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) { setProfile(null); setProfileFor(null); return; }
    const { data } = await supabase.from('profiles').select('id, username, terms_version, bio, avatar_path').eq('id', uid).maybeSingle();
    setProfile((data as Profile | null) ?? null);
    setProfileFor(uid);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN') signedIn();   // plays "Access granted" only if the sign-in screen armed it
      if (event === 'SIGNED_OUT') { void wipeTurns(); void wipeLists(); }   // the LUNEX conversation never outlives the session
      // Defer: never call supabase from inside this callback synchronously (can deadlock the auth lock).
      setTimeout(() => { void loadProfile(s?.user.id); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => ({
    // Still "loading" while a signed-in user's profile hasn't been looked up yet, so the router never guesses consent status.
    loading: loading || (!!session && profileFor !== session.user.id), session, profile,
    needsConsent: !!session && !!profile && profile.terms_version !== env.termsVersion,
    refreshProfile: () => loadProfile(session?.user.id),
    // Update locally right after accept_terms succeeds so the app never waits on (or loses) a profile re-fetch.
    markTermsAccepted: (version: string) => setProfile((p) => (p ? { ...p, terms_version: version } : p)),
    signOut: async () => { await supabase.auth.signOut(); },
  }), [loading, profileFor, session, profile, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
