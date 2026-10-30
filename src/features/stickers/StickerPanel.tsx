import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { Banner, Button, Text } from '@/components/ui';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';
import { stickerApi } from './api';
import { fitSize, type StickerItem } from './logic';
import { addToList, loadList, mineAdd, mineList, mineRemove, removeFromList, type Mine } from './store';

type Tab = 'recent' | 'fav' | 'find' | 'mine';
const TABS: [Tab, string][] = [['recent', 'Recent'], ['fav', 'Favourites'], ['find', 'Find'], ['mine', 'Mine']];
const CELL = 88;

export type StickerChoice = { kind: 'link'; item: StickerItem } | { kind: 'file'; uri: string };

/** Bottom sheet with Recent / Favourites / Find (trending + search via your LUNEX server) / My stickers. Tap to send, long-press to favourite or delete. */
export function StickerPanel({ me, onPick, onClose }: { me: string; onPick: (c: StickerChoice) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>(stickerApi.enabled ? 'find' : 'mine');
  const [recent, setRecent] = useState<StickerItem[]>([]); const [favs, setFavs] = useState<StickerItem[]>([]); const [mine, setMine] = useState<Mine[]>([]);
  const [found, setFound] = useState<StickerItem[]>([]); const [hasNext, setHasNext] = useState(false); const [page, setPage] = useState(1);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useRef('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => { void loadList('recent', me).then(setRecent); void loadList('fav', me).then(setFavs); void mineList(me).then(setMine); if (stickerApi.enabled) stickerApi.wake(); }, [me]);

  const run = useCallback(async (text: string, p: number, append: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = text ? await stickerApi.search(text, p) : await stickerApi.trending(p);
      if (!alive.current || query.current !== text) return;
      setFound((c) => (append ? [...c, ...r.items.filter((i) => !c.some((x) => x.url === i.url))] : r.items)); setHasNext(r.hasNext); setPage(p);
    } catch (e) { if (alive.current) setError(friendlyError(e)); }
    finally { if (alive.current) setBusy(false); }
  }, []);
  useEffect(() => { if (tab === 'find' && stickerApi.enabled && found.length === 0 && !busy) void run('', 1, false); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(item: StickerItem) { setRecent(await addToList('recent', me, item)); onPick({ kind: 'link', item }); }
  async function toggleFav(item: StickerItem) {
    const has = favs.some((f) => f.url === item.url);
    setFavs(has ? await removeFromList('fav', me, item.url) : await addToList('fav', me, item));
    setNotice(has ? 'Removed from favourites.' : 'Added to favourites.');
  }

  async function create(mode: 'fit' | 'fill', sendNow: boolean) {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      if ((a.fileSize ?? 0) > 10 * 1024 * 1024) return setError('Please choose a picture under 10 MB.');
      const plan = fitSize(a.width, a.height, mode);
      const actions = [...(plan.crop ? [{ crop: plan.crop }] : []), ...(plan.resize ? [{ resize: plan.resize }] : [])];
      const out = await manipulateAsync(a.uri, actions, { format: SaveFormat.WEBP, compress: 0.9 });
      const saved = await mineAdd(me, out.uri);
      setMine(await mineList(me));
      if (sendNow) onPick({ kind: 'file', uri: saved.uri }); else setNotice('Saved to My stickers.');
    } catch (e) { setError(friendlyError(e)); }
  }

  const list: StickerItem[] = tab === 'recent' ? recent : tab === 'fav' ? favs : found;
  const cell = (item: StickerItem) => (
    <Pressable key={item.url} accessibilityRole="button" accessibilityLabel={`Send sticker ${item.title}`} accessibilityHint="Long press to add or remove from favourites"
      onPress={() => void send(item)} onLongPress={() => void toggleFav(item)} style={{ width: CELL, height: CELL, margin: 4, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={{ uri: item.preview }} contentFit="contain" style={{ width: CELL - 6, height: CELL - 6 }} accessibilityLabel={item.title} />
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close stickers" accessibilityRole="button" onPress={onClose} style={{ flex: 1 }} />
      <View accessibilityViewIsModal style={{ height: '62%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.xs }} accessibilityRole="tablist">
          {TABS.map(([k, label]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => { setTab(k); setNotice(null); setError(null); }}
              style={{ flex: 1, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: tab === k ? colors.accentSoft : 'transparent' }}>
              <Text variant="small" style={{ fontWeight: '700', color: tab === k ? colors.accent : colors.muted }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Banner kind="error" text={error} /> : null}
        {notice ? <Text variant="small" muted accessibilityLiveRegion="polite">{notice}</Text> : null}

        {tab === 'find' && !stickerApi.enabled ? <Text muted>Sticker search is not set up. Your own stickers and favourites still work.</Text> : null}
        {tab === 'find' && stickerApi.enabled ? (
          <TextInput accessibilityLabel="Search stickers" value={q} onChangeText={setQ} returnKeyType="search" maxLength={60} placeholder="Search stickers" placeholderTextColor={colors.muted}
            onSubmitEditing={() => { const t = q.trim(); query.current = t; setFound([]); void run(t, 1, false); }}
            style={[type.body, { minHeight: MIN_TOUCH, color: colors.text, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: space.md }]} />
        ) : null}

        {tab !== 'mine' ? (
          <FlatList data={list} keyExtractor={(i) => i.url} numColumns={3} columnWrapperStyle={{ justifyContent: 'center' }} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => cell(item)}
            onEndReached={() => { if (tab === 'find' && hasNext && !busy) void run(query.current, page + 1, true); }} onEndReachedThreshold={0.4}
            ListEmptyComponent={busy ? undefined : <Text muted style={{ textAlign: 'center', marginTop: space.lg }}>{tab === 'recent' ? 'Stickers you send appear here.' : tab === 'fav' ? 'Long-press a sticker to add it to favourites.' : stickerApi.enabled && !error ? 'No stickers found.' : ''}</Text>}
            ListFooterComponent={busy ? <ActivityIndicator color={colors.accent} accessibilityLabel="Loading stickers" style={{ margin: space.md }} /> : undefined} />
        ) : (
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Button title="New (fit)" variant="soft" onPress={() => void create('fit', false)} /></View>
              <View style={{ flex: 1 }}><Button title="New (square)" variant="soft" onPress={() => void create('fill', false)} /></View>
            </View>
            <FlatList data={mine} keyExtractor={(i) => i.id} numColumns={3} columnWrapperStyle={{ justifyContent: 'center' }}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel="Send my sticker" accessibilityHint="Long press to delete" onPress={() => onPick({ kind: 'file', uri: item.uri })}
                  onLongPress={() => { void mineRemove(item.uri).then(async () => { setMine(await mineList(me)); setNotice('Sticker deleted.'); }); }} style={{ width: CELL, height: CELL, margin: 4, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={{ uri: item.uri }} contentFit="contain" style={{ width: CELL - 6, height: CELL - 6 }} accessibilityLabel="My sticker" />
                </Pressable>
              )}
              ListEmptyComponent={<Text muted style={{ textAlign: 'center', marginTop: space.lg }}>Turn any picture into a sticker. Only use pictures you are allowed to share.</Text>} />
          </View>
        )}
      </View>
    </Modal>
  );
}
