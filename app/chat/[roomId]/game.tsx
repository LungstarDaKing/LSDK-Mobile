import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { ActionSheet, ConfirmDialog, PromptDialog } from '@/components/dialogs';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChat } from '@/features/chat/ChatProvider';
import { gameApi } from '@/features/games/api';
import { RaceGame } from '@/features/games/race/RaceGame';
import { Dartboard } from '@/features/games/Dartboard';
import { DART_START, dartScore, dartsPlay, PIECE, PIECE_NAME, VERSUS, chessBoard, chessPlay, chessTargets, inCheck, needsPromotion, resultLine, tttPlay, tttWinner, twentyAnswer, twentyAsk, validateSecret, type Game, type GameKind } from '@/features/games/logic';
import { useGame } from '@/features/games/useGame';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth(); const me = session!.user.id;
  const router = useRouter(); const { colors } = useTheme();
  const { room, nameOf } = useChat();
  const g = useGame(roomId);
  const r = room(roomId);
  const other = r?.participants.find((p) => p.profile_id !== me);
  const who = (id: string) => nameOf(id, r?.participants.find((p) => p.profile_id === id)?.profiles?.username ?? 'Them');
  const [secretFor, setSecretFor] = useState<GameKind | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const game = g.game;
  const live = game && game.status === 'active' ? game : null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text variant="title" style={{ color: colors.accent }}>‹</Text></Pressable>
        <Text variant="title">Games{other ? ` with ${who(other.profile_id)}` : ''}</Text>
      </View>
      {g.error ? <Banner kind="error" text={g.error} /> : null}
      {!g.loaded ? <Text muted>Loading…</Text> : null}

      {g.loaded && game ? (
        <View style={{ gap: space.md }}>
          <Text variant="strong" accessibilityRole="header">{(VERSUS as Record<string, { title: string }>)[game.kind]?.title ?? 'Game'}</Text>
          {game.kind !== 'race' ? (
            <Text accessibilityLiveRegion="polite" muted>
              {game.status === 'done' ? resultLine(game, me, who) : game.turn === me ? 'Your turn' : `Waiting for ${who(game.turn ?? '')}…`}
            </Text>
          ) : null}
          {game.kind === 'race' ? <RaceGame game={game} me={me} who={who} onError={g.setError} onChanged={() => void g.reload()} onGaveUp={() => void g.resign()} /> : null}
          {game.kind === 'ttt' ? <Ttt game={game} me={me} busy={g.busy} onMove={g.move} /> : null}
          {game.kind === 'chess' ? <ChessView game={game} me={me} busy={g.busy} onMove={g.move} /> : null}
          {game.kind === 'hangman' ? <Hangman game={game} me={me} busy={g.busy} onGuess={g.guess} /> : null}
          {game.kind === 'twenty' ? <Twenty game={game} me={me} busy={g.busy} onMove={g.move} /> : null}
          {game.kind === 'darts' ? <Darts game={game} me={me} busy={g.busy} onMove={g.move} who={who} /> : null}
          {live ? <Button title="Give up" variant="soft" onPress={() => setConfirmResign(true)} /> : null}
        </View>
      ) : null}

      {g.loaded && !live ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Text variant="strong" accessibilityRole="header">{game ? 'Play again' : 'Pick a game'}</Text>
          {(Object.keys(VERSUS) as GameKind[]).map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${VERSUS[k].title}. ${VERSUS[k].blurb}`} disabled={g.busy}
              onPress={() => (VERSUS[k].secret ? setSecretFor(k) : void g.start(k, null))}
              style={{ minHeight: MIN_TOUCH + 12, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text variant="strong">{VERSUS[k].title}</Text><Text variant="small" muted>{VERSUS[k].blurb}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <PromptDialog visible={!!secretFor} title={secretFor ? VERSUS[secretFor].title : ''} label={secretFor ? VERSUS[secretFor].secret ?? '' : ''} submitLabel="Start" maxLength={40}
        validate={(v) => (secretFor ? validateSecret(secretFor, v) : null)}
        onSubmit={async (v) => { if (secretFor) await g.start(secretFor, v.trim()); }} onClose={() => setSecretFor(null)} />
      <ConfirmDialog visible={confirmResign} title="Give up?" body="The other person wins this game." confirmLabel="Give up" destructive onConfirm={() => void g.resign()} onClose={() => setConfirmResign(false)} />
    </Screen>
  );
}

type PanelProps = { game: Game; me: string; busy: boolean };

function Ttt({ game, me, busy, onMove }: PanelProps & { onMove: (m: NonNullable<ReturnType<typeof tttPlay>>) => void }) {
  const { colors } = useTheme();
  const board: (string | null)[] = game.state.board ?? [];
  const win = tttWinner(board)?.line ?? [];
  return (
    <View role="grid" style={{ flexDirection: 'row', flexWrap: 'wrap', width: 264, gap: 6, alignSelf: 'center' }}>
      {board.map((c, i) => (
        <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Square ${i + 1}, ${c ?? 'empty'}`} disabled={busy || !!c || game.status !== 'active' || game.turn !== me}
          onPress={() => { const m = tttPlay(game, i, me); if (m) onMove(m); }}
          style={{ width: 84, height: 84, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: win.includes(i) ? colors.accentSoft : colors.surface2 }}>
          <Text style={{ fontSize: 40, fontWeight: '700', color: c === 'X' ? colors.accent : colors.text }}>{c ?? ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChessView({ game, me, busy, onMove }: PanelProps & { onMove: (m: NonNullable<ReturnType<typeof chessPlay>>) => void }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const sq = Math.floor(Math.min(width - 32, 440) / 8);
  const white = me === game.p1; const fen: string = game.state.fen;
  const [sel, setSel] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => { setSel(null); setPromo(null); }, [fen]);
  const targets = sel ? chessTargets(fen, sel) : [];
  const mine = game.status === 'active' && game.turn === me && !busy;
  const last = game.state.last as { from: string; to: string } | undefined;

  function tap(square: string, piece: { color: string } | null) {
    if (!mine) return;
    if (sel && targets.includes(square)) {
      if (needsPromotion(fen, sel, square)) { setPromo({ from: sel, to: square }); return; }
      const m = chessPlay(game, me, sel, square); if (m) onMove(m); return;
    }
    setSel(piece && piece.color === (white ? 'w' : 'b') && square !== sel ? square : null);
  }
  return (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <Text variant="small" muted>You play {white ? 'white' : 'black'}{inCheck(fen) && game.status === 'active' ? ' · Check!' : ''}</Text>
      <View role="grid" accessibilityLabel="Chess board" style={{ width: sq * 8, height: sq * 8 }}>
        {chessBoard(fen, white).map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {row.map((p, ci) => {
              const file = 'abcdefgh'[white ? ci : 7 - ci]; const rank = white ? 8 - ri : ri + 1; const square = `${file}${rank}`;
              const dark = (ci + ri) % 2 === 1;
              const hl = square === sel ? colors.accent : targets.includes(square) ? colors.accentSoft : last && (last.from === square || last.to === square) ? colors.gold + '66' : undefined;
              return (
                <Pressable key={ci} accessibilityRole="button"
                  accessibilityLabel={`${square}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[p.type]}` : ', empty'}${targets.includes(square) ? ', can move here' : ''}${square === sel ? ', selected' : ''}`}
                  onPress={() => tap(square, p)}
                  style={{ width: sq, height: sq, alignItems: 'center', justifyContent: 'center', backgroundColor: hl ?? (dark ? '#8a6bd1' : '#e9e1ff') }}>
                  <Text style={{ fontSize: sq * 0.7, lineHeight: sq * 0.85, color: p?.color === 'w' ? '#fff' : '#111', textShadowColor: p?.color === 'w' ? '#000' : '#fff', textShadowRadius: 2 }}>{p ? PIECE[p.color + p.type] : ''}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <ActionSheet visible={!!promo} title="Promote to" onClose={() => setPromo(null)}
        actions={(['q', 'r', 'b', 'n'] as const).map((t) => ({ label: { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[t], onPress: () => { const p = promo!; const m = chessPlay(game, me, p.from, p.to, t); if (m) onMove(m); } }))} />
      {game.state.moves?.length ? <Text variant="small" muted accessibilityLabel={`Moves: ${game.state.moves.join(', ')}`}>{(game.state.moves as string[]).slice(-8).join('  ')}</Text> : null}
    </View>
  );
}

function Hangman({ game, me, busy, onGuess }: PanelProps & { onGuess: (l: string) => void }) {
  const { colors } = useTheme();
  const [secret, setSecret] = useState<string | null>(null);
  const guesser = me === game.p2;
  useEffect(() => { if (!guesser || game.status === 'done') void gameApi.secret(game.id).then(setSecret).catch(() => {}); }, [game.id, game.status, guesser]);
  const wrong: string[] = game.state.wrong ?? []; const right: string[] = game.state.right ?? []; const max: number = game.state.max ?? 7;
  const word: string | undefined = game.state.word ?? (game.status === 'done' ? secret ?? undefined : undefined);
  return (
    <View style={{ gap: space.md, alignItems: 'center' }}>
      <Text accessibilityLabel={`Word: ${(game.state.mask as string).split('').map((c) => (c === '_' ? 'blank' : c)).join(' ')}`} style={{ fontSize: 32, letterSpacing: 6, fontWeight: '700' }}>{(game.state.mask as string).split('').join(' ')}</Text>
      <Text muted>Wrong guesses: {wrong.length} of {max}{wrong.length ? ` (${wrong.join(' ')})` : ''}</Text>
      {!guesser && game.status === 'active' && secret ? <Text variant="small" muted>Your word: {secret}</Text> : null}
      {word ? <Text variant="small" muted>The word was {word}</Text> : null}
      {guesser && game.status === 'active' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          {LETTERS.map((l) => {
            const used = wrong.includes(l) || right.includes(l);
            return (
              <Pressable key={l} accessibilityRole="button" accessibilityLabel={`Letter ${l}${used ? ', already tried' : ''}`} disabled={used || busy || game.turn !== me} onPress={() => onGuess(l)}
                style={{ width: 40, height: MIN_TOUCH, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: right.includes(l) ? colors.success : wrong.includes(l) ? colors.danger : colors.surface2, opacity: used ? 0.6 : 1 }}>
                <Text style={{ color: used ? '#fff' : colors.text }}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Twenty({ game, me, busy, onMove }: PanelProps & { onMove: (m: NonNullable<ReturnType<typeof twentyAsk>>) => void }) {
  const { colors } = useTheme();
  const thinker = me === game.p1;
  const [secret, setSecret] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [isGuess, setIsGuess] = useState(false);
  useEffect(() => { if (thinker || game.status === 'done') void gameApi.secret(game.id).then(setSecret).catch(() => {}); }, [game.id, game.status, thinker]);
  const log: { q: string; g: boolean; a?: string }[] = game.state.log ?? [];
  const open = log[log.length - 1] && !log[log.length - 1].a ? log[log.length - 1] : null;
  return (
    <View style={{ gap: space.sm }}>
      {secret && (thinker || game.status === 'done') ? <Text variant="small" muted>{game.status === 'done' ? 'It was' : 'Your secret'}: {secret}</Text> : null}
      <Text variant="small" muted>Questions used: {log.length} of 20</Text>
      {log.map((e, i) => <Text key={i}>{i + 1}. {e.g ? 'Is it ' : ''}{e.q}{e.a ? ` — ${e.a}` : ' …'}</Text>)}
      {thinker && open && game.status === 'active' ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {['Yes', 'No', 'Sometimes'].map((a) => <Button key={a} title={a} disabled={busy} onPress={() => { const m = twentyAnswer(game, me, a); if (m) onMove(m); }} />)}
        </View>
      ) : null}
      {!thinker && game.status === 'active' && game.turn === me ? (
        <View style={{ gap: space.sm }}>
          <TextInput accessibilityLabel={isGuess ? 'Your final guess' : 'Your yes or no question'} value={q} onChangeText={setQ} maxLength={140} placeholder={isGuess ? 'Is it …?' : 'Ask a yes/no question'} placeholderTextColor={colors.muted}
            style={{ minHeight: MIN_TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.text }} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isGuess }} onPress={() => setIsGuess(!isGuess)} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text>{isGuess ? '☑' : '☐'} This is my final guess</Text></Pressable>
          <Button title="Send" disabled={busy || !q.trim()} onPress={() => { const m = twentyAsk(game, me, q, isGuess); if (m) { onMove(m); setQ(''); setIsGuess(false); } }} />
        </View>
      ) : null}
    </View>
  );
}

function Darts({ game, me, busy, onMove, who }: PanelProps & { onMove: (m: NonNullable<ReturnType<typeof dartsPlay>>) => void; who: (id: string) => string }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 340);
  const first = me === game.p1;
  const mineLeft: number = (first ? game.state.s1 : game.state.s2) ?? DART_START;
  const theirsLeft: number = (first ? game.state.s2 : game.state.s1) ?? DART_START;
  const mine = game.status === 'active' && game.turn === me && !busy;
  const [thrown, setThrown] = useState<{ x: number; y: number; pts: number; label: string }[]>([]);
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [sent, setSent] = useState(false);
  const aimRef = useRef(aim);
  useEffect(() => { setThrown([]); setSent(false); }, [game.version]);
  useEffect(() => {
    if (!mine || sent) return;
    let raf = 0; const t0 = Date.now(); const speed = 1 + thrown.length * 0.18;
    const loop = () => { const t = ((Date.now() - t0) / 1000) * speed; const a = { x: Math.sin(t * 1.7) * 0.92, y: Math.sin(t * 2.3 + 1) * 0.92 }; aimRef.current = a; setAim(a); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mine, sent, thrown.length]);
  const remaining = mineLeft - thrown.reduce((a, d) => a + d.pts, 0);
  const note = !thrown.length ? '' : remaining < 0 ? 'Bust! Over zero' : remaining === 0 ? 'Checkout!' : `${remaining} left`;

  function doThrow() {
    if (!mine || sent || thrown.length >= 3) return;
    const x = aimRef.current.x + (Math.random() - 0.5) * 0.06, y = aimRef.current.y + (Math.random() - 0.5) * 0.06;
    const next = [...thrown, { x, y, ...dartScore(x, y) }];
    setThrown(next);
    const left = mineLeft - next.reduce((a, d) => a + d.pts, 0);
    if (left <= 0 || next.length === 3) { setSent(true); setTimeout(() => { const m = dartsPlay(game, me, next); if (m) onMove(m); }, 1100); }
  }
  const turns: { by: number; darts: string[]; total: number; bust: boolean }[] = (game.state.turns ?? []).slice(-6).reverse();
  return (
    <View style={{ alignItems: 'center', gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        <Text variant="strong">You: {mineLeft}</Text><Text variant="strong">{who(first ? game.p2 : game.p1)}: {theirsLeft}</Text>
      </View>
      <Dartboard size={size} darts={thrown} aim={mine && !sent ? aim : null} />
      {mine ? <Text accessibilityLiveRegion="polite">This turn: {[0, 1, 2].map((i) => thrown[i]?.label ?? '–').join('  ·  ')}{note ? ` · ${note}` : ''}</Text> : null}
      {mine ? <Button title="Throw" onPress={doThrow} disabled={sent} /> : null}
      {turns.length ? turns.map((t, i) => <Text key={i} variant="small" muted>{t.by === 1 ? who(game.p1) : who(game.p2)}: {t.bust ? `${t.darts.join(' ')} · bust` : `${t.darts.join(' ')} = ${t.total}`}</Text>)
        : <Text variant="small" muted>First to exactly 0 wins. Going past zero is a bust and the turn is lost. Tap Throw when the cross is where you want it.</Text>}
    </View>
  );
}
