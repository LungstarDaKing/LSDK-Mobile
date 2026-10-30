// Two-player games in a direct chat. The database keeps shared state, enforces turn order/versions and hides the
// hangman / 20-questions secret; the rules for tic-tac-toe and chess are checked here (friendly games, like the website).
import { Chess } from 'chess.js';

export type GameKind = 'ttt' | 'chess' | 'hangman' | 'twenty' | 'darts' | 'race';
export type Game = {
  id: string; room_id: string; kind: GameKind; p1: string; p2: string; state: Record<string, any>; turn: string | null;
  status: 'active' | 'done'; winner: string | null; result: string | null; version: number; created_at: string; updated_at: string;
};
export type Move = { state: Record<string, unknown>; status: 'active' | 'done'; winner: string | null; result: string | null };

export const VERSUS: Record<GameKind, { title: string; blurb: string; secret: string | null }> = {
  ttt: { title: 'Tic-tac-toe', blurb: 'Three in a row. Quick one.', secret: null },
  chess: { title: 'Chess', blurb: 'Full rules. The one who starts plays white.', secret: null },
  hangman: { title: 'Hangman', blurb: 'You pick a word, they guess it letter by letter.', secret: 'Type a word for them to guess (3 to 20 letters)' },
  darts: { title: 'Darts', blurb: '301, first to exactly zero. Three darts a turn.', secret: null },
  race: { title: 'Car race', blurb: 'Pick a car and a real circuit. Race live, first across the line wins.', secret: null },
  twenty: { title: '20 Questions', blurb: 'You think of something. They have 20 yes/no questions.', secret: 'Think of a person, place or thing and type it. Only you can see it.' },
};

/* ---------- tic-tac-toe ---------- */
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function tttWinner(board: (string | null)[]): { mark: string; line: number[] } | null {
  for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a]!, line: [a, b, c] };
  return null;
}
export function tttPlay(game: Pick<Game, 'state' | 'status' | 'turn' | 'p1'>, idx: number, me: string): Move | null {
  const board: (string | null)[] = [...(game.state.board ?? [])];
  if (!Number.isInteger(idx) || idx < 0 || idx > 8 || game.status !== 'active' || game.turn !== me || board[idx]) return null;
  board[idx] = me === game.p1 ? 'X' : 'O';
  if (tttWinner(board)) return { state: { board }, status: 'done', winner: me, result: 'Three in a row' };
  if (board.every(Boolean)) return { state: { board }, status: 'done', winner: null, result: 'Draw' };
  return { state: { board }, status: 'active', winner: null, result: null };
}

/* ---------- 20 questions ---------- */
export const TWENTY_MAX = 20;
type QA = { q: string; g: boolean; a?: string };
export function twentyAsk(game: Pick<Game, 'state' | 'status' | 'turn' | 'p1'>, me: string, text: string, isGuess: boolean): Move | null {
  const q = String(text ?? '').trim().slice(0, 140);
  const open = (game.state.log as QA[] | undefined)?.at(-1);
  if (!q || game.status !== 'active' || game.turn !== me || me === game.p1 || (open && !open.a)) return null;
  const log = [...(game.state.log ?? []), { q, g: !!isGuess }];
  return { state: { log, asked: log.length }, status: 'active', winner: null, result: null };
}
export function twentyAnswer(game: Pick<Game, 'state' | 'status' | 'turn' | 'p1' | 'p2'>, me: string, answer: string): Move | null {
  if (game.status !== 'active' || game.turn !== me || me !== game.p1 || !['Yes', 'No', 'Sometimes'].includes(answer)) return null;
  const log: QA[] = [...(game.state.log ?? [])];
  const last = log[log.length - 1];
  if (!last || last.a) return null;
  log[log.length - 1] = { ...last, a: answer };
  const state = { log, asked: log.length };
  if (last.g && answer === 'Yes') return { state, status: 'done', winner: game.p2, result: 'Guessed it' };
  if (log.length >= TWENTY_MAX) return { state, status: 'done', winner: game.p1, result: 'Out of questions' };
  return { state, status: 'active', winner: null, result: null };
}

/* ---------- hangman ---------- */
export const HANGMAN_RE = /^[A-Za-z]{3,20}$/;
export function validateSecret(kind: GameKind, raw: string): string | null {
  const v = raw.trim();
  if (kind === 'hangman') return HANGMAN_RE.test(v) ? null : 'Use 3 to 20 letters, A to Z only.';
  if (kind === 'twenty') return v.length >= 2 && v.length <= 40 ? null : 'Think of something (2 to 40 characters).';
  return null;
}

/* ---------- chess ---------- */
export type ChessSquare = { square: string; type: string; color: 'w' | 'b' } | null;
export function chessBoard(fen: string, asWhite: boolean): ChessSquare[][] {
  const rows = new Chess(fen).board() as ChessSquare[][];
  return asWhite ? rows : [...rows].reverse().map((r) => [...r].reverse());
}
export function chessTargets(fen: string, from: string): string[] {
  try { return new Chess(fen).moves({ square: from as never, verbose: true }).map((m) => m.to); } catch { return []; }
}
export function needsPromotion(fen: string, from: string, to: string): boolean {
  try { return new Chess(fen).moves({ square: from as never, verbose: true }).some((m) => m.to === to && !!m.promotion); } catch { return false; }
}
/** Returns what to send, or null if it is not my turn / not a legal move. */
export function chessPlay(game: Pick<Game, 'state' | 'status' | 'turn' | 'p1'>, me: string, from: string, to: string, promotion = 'q'): Move | null {
  if (game.status !== 'active' || game.turn !== me) return null;
  const chess = new Chess(game.state.fen);
  const mine = me === game.p1 ? 'w' : 'b';
  if (chess.turn() !== mine) return null;
  let mv;
  try { mv = chess.move({ from, to, promotion }); } catch { return null; }
  const state = { fen: chess.fen(), moves: [...(game.state.moves ?? []), mv.san], last: { from: mv.from, to: mv.to } };
  if (chess.isCheckmate()) return { state, status: 'done', winner: me, result: 'Checkmate' };
  if (chess.isDraw()) return { state, status: 'done', winner: null, result: chess.isStalemate() ? 'Stalemate' : chess.isInsufficientMaterial() ? 'Insufficient material' : chess.isThreefoldRepetition() ? 'Repetition' : 'Draw' };
  return { state, status: 'active', winner: null, result: null };
}
export const PIECE: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
export const PIECE_NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
export function inCheck(fen: string): boolean { try { return new Chess(fen).inCheck(); } catch { return false; } }

export function resultLine(game: Pick<Game, 'status' | 'winner' | 'result'>, me: string, nameOf: (id: string) => string): string {
  if (game.status !== 'done') return '';
  const how = game.result ? ` (${game.result})` : '';
  if (!game.winner) return `Draw${how}`;
  return game.winner === me ? `You won${how}` : `${nameOf(game.winner)} won${how}`;
}

/* ---------- darts (301, straight out: finish on exactly zero, going past zero is a bust) ---------- */
export const DART_START = 301;
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];   // clockwise from the top
export type Dart = { pts: number; label: string; mult: number; seg: number };
/** x, y in "board radius" units: (0,0) is the middle, y grows downwards, 1 is the outer edge of the doubles. */
export function dartScore(x: number, y: number): Dart {
  const r = Math.hypot(x, y);
  if (r <= 0.037) return { pts: 50, label: 'Bullseye', mult: 2, seg: 25 };
  if (r <= 0.094) return { pts: 25, label: '25', mult: 1, seg: 25 };
  if (r > 1) return { pts: 0, label: 'Miss', mult: 0, seg: 0 };
  let ang = (Math.atan2(x, -y) * 180) / Math.PI;           // 0 = straight up, clockwise
  if (ang < 0) ang += 360;
  const seg = BOARD_ORDER[Math.floor(((ang + 9) % 360) / 18)];
  const mult = r >= 0.953 ? 2 : r >= 0.582 && r <= 0.629 ? 3 : 1;
  return { pts: seg * mult, label: mult === 3 ? `T${seg}` : mult === 2 ? `D${seg}` : String(seg), mult, seg };
}
/** A turn is up to three darts. Returns what to send, or null if it is not allowed. */
export function dartsPlay(game: Pick<Game, 'state' | 'status' | 'turn' | 'p1'>, me: string, darts: Pick<Dart, 'pts' | 'label'>[]): Move | null {
  if (game.status !== 'active' || game.turn !== me || !Array.isArray(darts) || darts.length < 1 || darts.length > 3) return null;
  const first = me === game.p1;
  const before: number = first ? game.state.s1 : game.state.s2;
  let left = before, bust = false, thrown = 0;
  for (const d of darts) { thrown++; if (left - d.pts < 0) { bust = true; break; } left -= d.pts; if (left === 0) break; }
  if (!bust && left !== 0 && darts.length < 3) return null;      // three darts unless you finish or bust
  const after = bust ? before : left;
  const used = darts.slice(0, thrown);
  const turn = { by: first ? 1 : 2, darts: used.map((d) => d.label), total: bust ? 0 : used.reduce((a, d) => a + d.pts, 0), bust };
  const turns = [...(game.state.turns ?? []), turn].slice(-16);
  const state = { s1: first ? after : game.state.s1, s2: first ? game.state.s2 : after, turns };
  if (after === 0) return { state, status: 'done', winner: me, result: `Checked out in round ${Math.ceil(turns.length / 2)}` };
  return { state, status: 'active', winner: null, result: null };
}
