import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Button, Screen, Text } from '@/components/ui';
import { bestScore, newStickman, pick, sameWord, scramble, songRound, stickmanStep, WORDS } from '@/features/games/solo';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

const GAMES = [
  { id: 'stickman', title: 'Stickman run', blurb: 'Jump the blocks. How far can you get?' },
  { id: 'emoji', title: 'Emoji song challenge', blurb: 'Guess the song from the emojis.' },
  { id: 'word', title: 'Word puzzles', blurb: 'Unscramble the letters.' },
] as const;

export default function Solo() {
  const router = useRouter(); const { colors } = useTheme();
  const [game, setGame] = useState<(typeof GAMES)[number]['id'] | null>(null);
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (game ? setGame(null) : router.back())} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text variant="title" style={{ color: colors.accent }}>‹</Text></Pressable>
        <Text variant="title">{game ? GAMES.find((g) => g.id === game)!.title : 'Play on your own'}</Text>
      </View>
      {!game ? GAMES.map((g) => (
        <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`${g.title}. ${g.blurb}`} onPress={() => setGame(g.id)}
          style={{ minHeight: MIN_TOUCH + 12, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text variant="strong">{g.title}</Text><Text variant="small" muted>{g.blurb}</Text>
        </Pressable>
      )) : null}
      {game === 'emoji' ? <EmojiSong /> : null}
      {game === 'word' ? <WordPuzzle /> : null}
      {game === 'stickman' ? <Stickman /> : null}
    </Screen>
  );
}

function EmojiSong({ rounds = 10 }: { rounds?: number }) {
  const { colors } = useTheme();
  const [n, setN] = useState(0); const [score, setScore] = useState(0); const [best, setBest] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const [round, setRound] = useState(() => { const r = songRound(); seen.current.add(r.answer); return r; });
  const next = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (next.current) clearTimeout(next.current); }, []);
  useEffect(() => { if (n >= rounds) void bestScore.get('emoji').then(async (b) => { const m = Math.max(b, score); setBest(m); await bestScore.set('emoji', m); }); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  function answer(o: string) {
    if (chosen) return;
    setChosen(o); if (o === round.answer) setScore((s) => s + 1);
    next.current = setTimeout(() => {
      let r = songRound(); let guard = 0; while (seen.current.has(r.answer) && guard++ < 50) r = songRound();
      seen.current.add(r.answer); setRound(r); setChosen(null); setN((x) => x + 1);
    }, 1100);
  }
  if (n >= rounds) return (
    <View style={{ gap: space.md }}>
      <Text variant="title">You got {score} of {rounds}</Text><Text muted>Best on this phone: {best}</Text>
      <Button title="Play again" onPress={() => { seen.current.clear(); const r = songRound(); seen.current.add(r.answer); setRound(r); setN(0); setScore(0); setChosen(null); }} />
    </View>
  );
  return (
    <View style={{ gap: space.md }}>
      <Text variant="small" muted>Round {n + 1} of {rounds} · Score {score}</Text>
      <Text accessibilityLabel="Emoji clue" style={{ fontSize: 56, textAlign: 'center' }}>{round.emoji}</Text>
      <Text>Which song is this?</Text>
      {round.options.map((o) => {
        const right = chosen && o === round.answer, wrong = chosen === o && o !== round.answer;
        return <Pressable key={o} accessibilityRole="button" accessibilityLabel={o} disabled={!!chosen} onPress={() => answer(o)}
          style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: right ? colors.success : wrong ? colors.danger : colors.border, backgroundColor: colors.surface }}><Text>{o}</Text></Pressable>;
      })}
      <Text accessibilityLiveRegion="polite">{chosen ? (chosen === round.answer ? 'Yes!' : `It was ${round.answer}`) : ' '}</Text>
    </View>
  );
}

function WordPuzzle({ rounds = 8 }: { rounds?: number }) {
  const { colors } = useTheme();
  const [list, setList] = useState(() => pick(WORDS, rounds));
  const [n, setN] = useState(0); const [score, setScore] = useState(0); const [best, setBest] = useState(0);
  const [guess, setGuess] = useState(''); const [fb, setFb] = useState(''); const [hinted, setHinted] = useState(false); const [locked, setLocked] = useState(false);
  const word = list[n]?.[0] ?? ''; const hint = list[n]?.[1] ?? '';
  const [tiles, setTiles] = useState(() => scramble(list[0][0]));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (n >= rounds) void bestScore.get('word').then(async (b) => { const m = Math.max(b, score); setBest(m); await bestScore.set('word', m); }); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  function advance(msg: string) {
    setFb(msg); setLocked(true);
    timer.current = setTimeout(() => { const k = n + 1; setN(k); setGuess(''); setFb(''); setHinted(false); setLocked(false); if (k < rounds) setTiles(scramble(list[k][0])); }, 1100);
  }
  function check() {
    if (locked) return;
    if (sameWord(guess, word)) { setScore((s) => s + (hinted ? 1 : 2)); advance('Correct!'); } else setFb('Not quite. Try again.');
  }
  if (n >= rounds) return (
    <View style={{ gap: space.md }}>
      <Text variant="title">Score {score}</Text><Text muted>Best on this phone: {best}</Text>
      <Button title="Play again" onPress={() => { const l = pick(WORDS, rounds); setList(l); setTiles(scramble(l[0][0])); setN(0); setScore(0); }} />
    </View>
  );
  return (
    <View style={{ gap: space.md }}>
      <Text variant="small" muted>Word {n + 1} of {rounds} · Score {score}</Text>
      <View accessibilityLabel={`Scrambled letters: ${tiles.split('').join(' ')}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {tiles.split('').map((l, i) => <View key={i} style={{ width: 36, height: 44, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text variant="strong">{l}</Text></View>)}
      </View>
      {hinted ? <Text variant="small">Hint: {hint}. Starts with {word[0]}. (Worth 1 point now)</Text> : null}
      <TextInput accessibilityLabel="Your answer" value={guess} onChangeText={setGuess} onSubmitEditing={check} autoCapitalize="characters" autoCorrect={false} maxLength={word.length + 2} editable={!locked}
        placeholder="Type the word" placeholderTextColor={colors.muted} style={{ minHeight: MIN_TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.text }} />
      <Button title="Check" onPress={check} disabled={locked || !guess.trim()} />
      <Text accessibilityLiveRegion="polite">{fb || ' '}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Hint" variant="soft" onPress={() => setHinted(true)} disabled={locked} />
        <Button title="Skip" variant="soft" onPress={() => advance(`It was ${word}`)} disabled={locked} />
      </View>
    </View>
  );
}

function Stickman() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const W = 560, H = 220, GROUND = 180; const px = Math.min(width - 32, 560);
  const st = useRef(newStickman());
  const [, frame] = useState(0);
  const [started, setStarted] = useState(false); const [best, setBest] = useState(0);
  const dist = useRef(0);
  useEffect(() => { void bestScore.get('stick').then(setBest); }, []);
  useEffect(() => {
    if (!started) return;
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
      const s = st.current;
      if (!s.dead) { stickmanStep(s, dt); dist.current += s.speed * dt; if (s.dead) { setBest((b) => { const m = Math.max(b, s.score); void bestScore.set('stick', m); return m; }); } }
      frame((f) => f + 1); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started]);
  const s = st.current;
  function jump() { if (s.dead) { st.current = newStickman(); dist.current = 0; setStarted(true); frame((f) => f + 1); return; } if (!started) setStarted(true); s.jumpReq = true; }
  const x = 60, y = GROUND - s.y; const run = Math.sin(s.t * 18) * 9; const air = s.y > 0;
  const col = s.dead ? '#ff5d73' : '#fff';
  return (
    <View style={{ gap: space.sm, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={s.dead ? 'Game over. Tap to try again.' : 'Stickman runner. Tap to jump.'} onPress={jump}>
        <Svg width={px} height={(px * H) / W} viewBox={`0 0 ${W} ${H}`}>
          <Rect width={W} height={H} fill="#1b1245" /><Rect y={GROUND} width={W} height={H - GROUND} fill="#3a2a86" /><Line x1={0} x2={W} y1={GROUND + 1} y2={GROUND + 1} stroke="#8f78ff" strokeWidth={2} />
          {s.obs.map((o, i) => <Rect key={i} x={o.x} y={GROUND - o.h} width={o.w} height={o.h} rx={4} fill="#e8a92a" stroke="#5a3200" strokeWidth={1.5} />)}
          <Circle cx={x} cy={y - 40} r={7} stroke={col} strokeWidth={3.2} fill="none" />
          <Line x1={x} y1={y - 33} x2={x} y2={y - 14} stroke={col} strokeWidth={3.2} strokeLinecap="round" />
          <Line x1={x} y1={y - 28} x2={x + 10 + (air ? 9 : run) / 2} y2={y - (air ? 33 : 20)} stroke={col} strokeWidth={3.2} strokeLinecap="round" />
          <Line x1={x} y1={y - 28} x2={x - 10 - (air ? 9 : run) / 2} y2={y - (air ? 33 : 20)} stroke={col} strokeWidth={3.2} strokeLinecap="round" />
          <Line x1={x} y1={y - 14} x2={x + 8 + (air ? 5 : run)} y2={y - (air ? 4 : 0)} stroke={col} strokeWidth={3.2} strokeLinecap="round" />
          <Line x1={x} y1={y - 14} x2={x - 8 - (air ? 5 : run)} y2={y - (air ? 8 : 0)} stroke={col} strokeWidth={3.2} strokeLinecap="round" />
        </Svg>
      </Pressable>
      <Text accessibilityLiveRegion="polite">{!started ? 'Tap to start, tap to jump.' : s.dead ? `Ouch! Score ${s.score}. Tap to try again.` : `Score ${s.score}`} · Best {Math.max(best, s.score)}</Text>
      <Button title={s.dead || !started ? 'Start' : 'Jump'} onPress={jump} />
    </View>
  );
}
