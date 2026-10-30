import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { searchUsers, type UserHit } from '@/features/chat/api';
import { colorIndex } from '@/lib/hash';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';
import { Avatar, Text } from './ui';

/** Username search (min 2 chars, debounced, stale replies ignored). `selected` shows a check for multi-select. */
export function UserPicker({ me, exclude = [], selected = [], onPick, autoFocus }: {
  me: string; exclude?: string[]; selected?: string[]; onPick: (u: UserHit) => void; autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const excludeKey = exclude.join(',');

  useEffect(() => {
    const my = ++seq.current;
    if (q.trim().length < 2) { setHits([]); setBusy(false); setError(null); return; }
    setBusy(true);
    const t = setTimeout(() => {
      searchUsers(q, me, exclude)
        .then((r) => { if (my === seq.current) { setHits(r); setError(null); setBusy(false); } })
        .catch((e) => { if (my === seq.current) { setError(friendlyError(e)); setHits([]); setBusy(false); } });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, me, excludeKey]);

  const tooShort = q.trim().length < 2;
  return (
    <View style={{ gap: space.sm }}>
      <TextInput
        accessibilityLabel="Search by username" value={q} onChangeText={setQ} autoFocus={autoFocus} autoCapitalize="none" autoCorrect={false}
        maxLength={20} placeholder="Search by username" placeholderTextColor={colors.muted} returnKeyType="search"
        style={[type.body, { minHeight: MIN_TOUCH + 4, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md }]}
      />
      {busy ? <ActivityIndicator color={colors.accent} accessibilityLabel="Searching" /> : null}
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text>
        : tooShort ? <Text variant="small" muted>Type at least 2 characters.</Text>
        : !busy && hits.length === 0 ? <Text variant="small" muted>No users found.</Text> : null}
      {hits.map((u) => {
        const on = selected.includes(u.id);
        return (
          <Pressable
            key={u.id} accessibilityRole="button" accessibilityLabel={`${u.username}${on ? ', selected' : ''}`} onPress={() => onPick(u)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: pressed ? colors.surface2 : colors.surface })}
          >
            <Avatar name={u.username} size={40} index={colorIndex(u.id)} path={u.avatar_path} />
            <View style={{ flex: 1 }}>
              <Text variant="strong" numberOfLines={1}>{u.username}</Text>
              {u.bio ? <Text variant="small" muted numberOfLines={1}>{u.bio}</Text> : null}
            </View>
            {on ? <Text variant="strong" style={{ color: colors.accent }}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
