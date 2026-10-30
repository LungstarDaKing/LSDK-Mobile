import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Switch, View } from 'react-native';
import { Avatar, Banner, Button, Loading, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { loadPrivacy, setPrivacy, setReadReceipts, type Privacy } from '@/features/chat/api';
import { loadSharing, setSharing } from '@/features/status/api';
import { NotificationSettings } from '@/components/NotificationSettings';
import { unregister } from '@/features/push/push';
import { RingtonePicker } from '@/components/RingtonePicker';
import { BackgroundPicker } from '@/components/BackgroundPicker';
import { setTypingEnabled, typingEnabled } from '@/lib/prefs';
import { colorIndex } from '@/lib/hash';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

function Row({ label, hint, value, disabled, onChange }: { label: string; hint: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text variant="strong">{label}</Text>
        <Text variant="small" muted>{hint}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} />
    </View>
  );
}

export default function Settings() {
  const { profile, session, signOut } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [priv, setPriv] = useState<Privacy | null>(null);
  const [typing, setTyping] = useState(true);
  const [share, setShare] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPrivacy(me).then((p) => alive && setPriv(p)).catch((e) => { if (alive) { setError(friendlyError(e)); setPriv({ show_online: true, show_last_seen: true, read_receipts: true }); } });
    typingEnabled().then((v) => alive && setTyping(v));
    loadSharing(me).then((v) => alive && setShare(v)).catch(() => alive && setShare(true));
    return () => { alive = false; };
  }, [me]);

  // Optimistic toggle with rollback when the server refuses.
  async function change(next: Privacy, save: () => Promise<void>) {
    const before = priv;
    setPriv(next); setError(null);
    try { await save(); } catch (e) { setPriv(before); setError(friendlyError(e)); }
  }

  return (
    <Screen scroll>
      <View style={{ gap: space.lg }}>
        <Text variant="title">Settings</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={profile?.username ?? '?'} size={64} index={colorIndex(me)} path={profile?.avatar_path} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="strong">{profile?.username ?? '...'}</Text>
            <Text muted numberOfLines={1}>{session?.user.email}</Text>
          </View>
        </View>
        <Button title="Edit profile, password and data" variant="soft" onPress={() => router.push('/profile')} />

        <Text variant="h2">Legal</Text>
        <LegalLinks />

        <Text variant="h2">Privacy</Text>
        {error ? <Banner kind="error" text={error} /> : null}
        {!priv ? <Loading /> : (
          <View>
            <Row label="Show when I am online" hint="If you hide it, you cannot see others' online status either."
              value={priv.show_online}
              onChange={(v) => change({ ...priv, show_online: v, show_last_seen: v ? priv.show_last_seen : false }, () => setPrivacy(v, v ? priv.show_last_seen : false))} />
            <Row label="Show my last seen" hint="Needs 'online' turned on. Works both ways."
              value={priv.show_online && priv.show_last_seen} disabled={!priv.show_online}
              onChange={(v) => change({ ...priv, show_last_seen: v }, () => setPrivacy(priv.show_online, v))} />
            <Row label="Read receipts (Seen)" hint="If you turn them off, you will not see others' either."
              value={priv.read_receipts}
              onChange={(v) => change({ ...priv, read_receipts: v }, () => setReadReceipts(v))} />
            <Row label="Share my status" hint="If off, nobody sees your status updates, including new ones."
              value={share ?? true} disabled={share === null}
              onChange={async (v) => { const before = share; setShare(v); setError(null); try { await setSharing(v); } catch (e) { setShare(before); setError(friendlyError(e)); } }} />
            <Row label="Typing bubbles" hint="Show and send 'typing…'. This device only." value={typing}
              onChange={(v) => { setTyping(v); void setTypingEnabled(v); }} />
          </View>
        )}

        <BackgroundPicker />
        <NotificationSettings />
        <RingtonePicker />
        <Button title="Sign out" variant="soft" onPress={async () => { await unregister().catch(() => {}); await signOut(); }} />
      </View>
    </Screen>
  );
}
