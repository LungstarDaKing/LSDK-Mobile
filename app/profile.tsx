import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ConfirmDialog, PromptDialog } from '@/components/dialogs';
import { Avatar, Banner, Button, Field, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChat } from '@/features/chat/ChatProvider';
import { pickAvatar } from '@/features/media/pick';
import { saveJson } from '@/features/media/saveJson';
import { changePassword, deleteAccountEverything, exportMyData, setAvatarPath, updateProfileText, uploadAvatar, removeAvatarFiles } from '@/features/media/storage';
import { colorIndex } from '@/lib/hash';
import { friendlyError, MIN_PASSWORD, USERNAME_RE } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, space } from '@/theme/tokens';

const MAX_BIO = 160;

export default function Profile() {
  const router = useRouter();
  const { colors } = useTheme();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const { rooms } = useChat();
  const me = session!.user.id;

  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<null | 'text' | 'avatar' | 'pw' | 'export' | 'delete'>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [removeAv, setRemoveAv] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const ok = (text: string) => setMsg({ kind: 'success', text });
  const fail = (e: unknown) => setMsg({ kind: 'error', text: friendlyError(e) });

  const dirty = username.trim() !== (profile?.username ?? '') || bio.trim() !== (profile?.bio ?? '');
  const usernameError = username && !USERNAME_RE.test(username.trim()) ? 'Username must be 3-20 letters, numbers or underscores.' : undefined;

  async function saveText() {
    setMsg(null);
    if (usernameError || !username.trim()) return setMsg({ kind: 'error', text: usernameError ?? 'Enter a username.' });
    setBusy('text');
    try {
      const patch: { username?: string; bio?: string | null } = {};
      if (username.trim() !== profile?.username) patch.username = username.trim();
      if (bio.trim() !== (profile?.bio ?? '')) patch.bio = bio.trim() ? bio.trim().slice(0, MAX_BIO) : null;
      await updateProfileText(me, patch);
      await refreshProfile();
      ok('Profile saved.');
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function changePicture() {
    setMsg(null); setBusy('avatar');
    let uploaded: string | null = null;
    try {
      const res = await pickAvatar();
      if (!res) return;
      if ('error' in res) return setMsg({ kind: 'error', text: res.error });
      uploaded = await uploadAvatar(me, res);
      await setAvatarPath(me, uploaded, profile?.avatar_path ?? null);
      uploaded = null;
      await refreshProfile();
      ok('Profile picture updated.');
    } catch (e) {
      if (uploaded) await removeAvatarFiles([uploaded]).catch(() => {});   // don't leave an unused file behind
      fail(e);
    } finally { setBusy(null); }
  }

  async function removePicture() {
    setBusy('avatar'); setMsg(null);
    try { await setAvatarPath(me, null, profile?.avatar_path ?? null); await refreshProfile(); ok('Profile picture removed.'); }
    catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function savePassword() {
    setMsg(null);
    if (pw.length < MIN_PASSWORD) return setMsg({ kind: 'error', text: `Password must be at least ${MIN_PASSWORD} characters.` });
    if (pw !== pw2) return setMsg({ kind: 'error', text: 'The two passwords do not match.' });
    setBusy('pw');
    try { await changePassword(pw); setPw(''); setPw2(''); ok('Password changed.'); } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function exportData() {
    setMsg(null); setBusy('export');
    try {
      const data = await exportMyData(me);
      const how = await saveJson(`lsdk-chat-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      ok(how === 'saved' ? 'Your data was downloaded.' : 'Your data is ready to save or share.');
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function deleteAccount() {
    setBusy('delete'); setMsg(null);
    try {
      await deleteAccountEverything(me, rooms.map((r) => r.id), profile?.avatar_path ?? null);
      await signOut().catch(() => {});
    } catch (e) { fail(e); setBusy(null); }
  }

  return (
    <Screen scroll>
      <View style={{ gap: space.lg }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent }}>‹ Back</Text>
        </Pressable>
        <Text variant="title" accessibilityRole="header">Profile</Text>
        {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}

        <View style={{ alignItems: 'center', gap: space.md }}>
          <Avatar name={profile?.username ?? '?'} size={112} index={colorIndex(me)} path={profile?.avatar_path} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Change picture" variant="soft" onPress={changePicture} loading={busy === 'avatar'} disabled={!!busy} />
            {profile?.avatar_path ? <Button title="Remove" variant="ghost" onPress={() => setRemoveAv(true)} disabled={!!busy} /> : null}
          </View>
        </View>

        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} error={usernameError} />
        <Field label="Bio" hint={`${bio.length}/${MAX_BIO}`} value={bio} onChangeText={setBio} maxLength={MAX_BIO} multiline />
        <Button title="Save profile" onPress={saveText} loading={busy === 'text'} disabled={!dirty || !!busy} />

        <Text variant="h2">Password</Text>
        <Field label="New password" secure value={pw} onChangeText={setPw} autoCapitalize="none" textContentType="newPassword" hint={`At least ${MIN_PASSWORD} characters`} />
        <Field label="Repeat new password" secure value={pw2} onChangeText={setPw2} autoCapitalize="none" textContentType="newPassword" />
        <Button title="Change password" variant="soft" onPress={savePassword} loading={busy === 'pw'} disabled={!pw || !!busy} />

        <Text variant="h2">Your data</Text>
        <Text muted>Download your profile and the messages you sent as a JSON file. Photos, videos and files are listed by name but not included.</Text>
        <Button title="Export my data" variant="soft" onPress={exportData} loading={busy === 'export'} disabled={!!busy} />

        <Text variant="h2" style={{ color: colors.danger }}>Delete account</Text>
        <Text muted>Permanently removes your account, your messages and your uploaded files. This cannot be undone. Files in chats you already left may not be reachable and can remain until an administrator clears them.</Text>
        <Button title="Delete my account" variant="danger" onPress={() => setDeleting(true)} loading={busy === 'delete'} disabled={!!busy} />
      </View>

      <ConfirmDialog visible={removeAv} title="Remove profile picture?" confirmLabel="Remove" destructive onConfirm={() => void removePicture()} onClose={() => setRemoveAv(false)} />
      <PromptDialog
        visible={deleting} title="Delete your account?" label="Type DELETE to confirm" submitLabel="Delete forever" maxLength={6}
        validate={(v) => (v.trim() === 'DELETE' ? null : 'Type DELETE in capital letters to confirm.')}
        onSubmit={() => { void deleteAccount(); }} onClose={() => setDeleting(false)}
      />
    </Screen>
  );
}
