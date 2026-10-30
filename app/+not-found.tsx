import { Redirect } from 'expo-router';
import { Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';

/** A guarded or unknown address goes to the right front door instead of looping on "/" (which is guarded while terms are pending). */
export default function NotFound() {
  const { loading, session, needsConsent } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={needsConsent ? '/consent' : '/(tabs)'} />;
}
