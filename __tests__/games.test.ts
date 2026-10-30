import { chessBoard, chessPlay, chessTargets, needsPromotion, resultLine, tttPlay, tttWinner, twentyAnswer, twentyAsk, validateSecret, type Game } from '@/features/games/logic';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const g = (o: Partial<Game> = {}) => ({ p1: 'a', p2: 'b', turn: 'a', status: 'active', state: { board: Array(9).fill(null) }, ...o }) as Game;

describe('tic-tac-toe', () => {
  test('X starts, turn and occupied squares are enforced', () => {
    expect(tttPlay(g(), 4, 'b')).toBeNull();                         // not b's turn
    const m = tttPlay(g(), 4, 'a')!; expect(m.state.board).toEqual([null, null, null, null, 'X', null, null, null, null]);
    expect(tttPlay(g({ state: m.state }), 4, 'a')).toBeNull();      // occupied
    expect(tttPlay(g(), 9, 'a')).toBeNull(); expect(tttPlay(g({ status: 'done' }), 1, 'a')).toBeNull();
  });
  test('win and draw are detected', () => {
    const win = tttPlay(g({ state: { board: ['X', 'X', null, 'O', 'O', null, null, null, null] } }), 2, 'a')!;
    expect(win).toMatchObject({ status: 'done', winner: 'a', result: 'Three in a row' });
    const draw = tttPlay(g({ state: { board: ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null] } }), 8, 'a')!;
    expect(draw).toMatchObject({ status: 'done', winner: null, result: 'Draw' });
    expect(tttWinner(['O', null, null, null, 'O', null, null, null, 'O'])!.line).toEqual([0, 4, 8]);
  });
});

describe('20 questions', () => {
  const base = { p1: 'a', p2: 'b', status: 'active', state: { log: [], asked: 0 } } as unknown as Game;
  test('only the asker asks, only the thinker answers, one open question at a time', () => {
    expect(twentyAsk({ ...base, turn: 'b' }, 'a', 'Is it big?', false)).toBeNull();
    const asked = twentyAsk({ ...base, turn: 'b' }, 'b', ' Is it big? ', false)!; expect(asked.state.log).toEqual([{ q: 'Is it big?', g: false }]);
    expect(twentyAsk({ ...base, turn: 'b', state: asked.state }, 'b', 'again', false)).toBeNull();
    expect(twentyAnswer({ ...base, turn: 'a', state: asked.state }, 'b', 'Yes')).toBeNull();
    expect(twentyAnswer({ ...base, turn: 'a', state: asked.state }, 'a', 'Maybe')).toBeNull();
  });
  test('right guess ends the game for the asker; running out ends it for the thinker', () => {
    const guess = twentyAsk({ ...base, turn: 'b' }, 'b', 'Is it a cat?', true)!;
    expect(twentyAnswer({ ...base, turn: 'a', state: guess.state }, 'a', 'Yes')).toMatchObject({ status: 'done', winner: 'b', result: 'Guessed it' });
    const log = Array.from({ length: 19 }, () => ({ q: 'q', g: false, a: 'No' })); log.push({ q: 'last', g: false } as never);
    expect(twentyAnswer({ ...base, turn: 'a', state: { log, asked: 20 } }, 'a', 'No')).toMatchObject({ status: 'done', winner: 'a', result: 'Out of questions' });
  });
});

describe('secrets', () => {
  test('hangman word and 20 questions thing follow the database rules', () => {
    expect(validateSecret('hangman', 'ab')).toMatch(/3 to 20/); expect(validateSecret('hangman', 'cat1')).toMatch(/A to Z/); expect(validateSecret('hangman', 'Banana')).toBeNull();
    expect(validateSecret('twenty', 'a')).toMatch(/2 to 40/); expect(validateSecret('twenty', 'A cat')).toBeNull(); expect(validateSecret('chess', '')).toBeNull();
  });
});

describe('chess', () => {
  const cg = (o: Partial<Game> = {}) => ({ p1: 'a', p2: 'b', turn: 'a', status: 'active', state: { fen: START, moves: [] }, ...o }) as Game;
  test('white (the starter) moves; illegal and wrong-colour moves are refused', () => {
    const m = chessPlay(cg(), 'a', 'e2', 'e4')!;
    expect(m.status).toBe('active'); expect(m.state.moves).toEqual(['e4']); expect(m.state.last).toEqual({ from: 'e2', to: 'e4' });
    expect(chessPlay(cg(), 'a', 'e2', 'e5')).toBeNull();
    expect(chessPlay(cg({ turn: 'b' }), 'b', 'e7', 'e5')).toBeNull();              // fen says white to move
    expect(chessPlay(cg(), 'b', 'e2', 'e4')).toBeNull();
  });
  test("fool's mate ends the game with the mover winning", () => {
    let game = cg(); const seq: [string, string, string][] = [['a', 'f2', 'f3'], ['b', 'e7', 'e5'], ['a', 'g2', 'g4'], ['b', 'd8', 'h4']];
    let last = null as ReturnType<typeof chessPlay>;
    for (const [who, f, t] of seq) { last = chessPlay({ ...game, turn: who }, who, f, t); expect(last).not.toBeNull(); game = { ...game, state: last!.state } as Game; }
    expect(last).toMatchObject({ status: 'done', winner: 'b', result: 'Checkmate' });
  });
  test('stalemate is a draw', () => {
    const fen = '7k/5Q2/8/8/8/8/8/K7 w - - 0 1';   // white plays Qf7-g6: black king h8 has no moves and is not in check
    const m = chessPlay(cg({ state: { fen, moves: [] } }), 'a', 'f7', 'g6')!;
    expect(m).toMatchObject({ status: 'done', winner: null, result: 'Stalemate' });
  });
  test('promotion is detected and applied', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(needsPromotion(fen, 'a7', 'a8')).toBe(true); expect(needsPromotion(START, 'e2', 'e4')).toBe(false);
    const m = chessPlay(cg({ state: { fen, moves: [] } }), 'a', 'a7', 'a8', 'n')!; expect(m.state.moves).toEqual(['a8=N']);
  });
  test('board orientation and targets', () => {
    expect(chessBoard(START, true)[7][4]).toMatchObject({ square: 'e1', type: 'k', color: 'w' });
    expect(chessBoard(START, false)[7][3]).toMatchObject({ square: 'e8', type: 'k', color: 'b' })      // black sees the board turned round;
    expect(chessTargets(START, 'g1').sort()).toEqual(['f3', 'h3']); expect(chessTargets(START, 'zz')).toEqual([]);
  });
});

test('resultLine', () => {
  const n = (id: string) => (id === 'b' ? 'Bob' : 'Me');
  expect(resultLine({ status: 'active', winner: null, result: null }, 'a', n)).toBe('');
  expect(resultLine({ status: 'done', winner: 'a', result: 'Checkmate' }, 'a', n)).toBe('You won (Checkmate)');
  expect(resultLine({ status: 'done', winner: 'b', result: null }, 'a', n)).toBe('Bob won');
  expect(resultLine({ status: 'done', winner: null, result: 'Draw' }, 'a', n)).toBe('Draw (Draw)');
});
