import { BASE_DECK, card, type Card, type Phase } from './cards';

export type PlayerId = 0 | 1;

export const SLOTS = 4;
export const HAND_SIZE = 5;

/** Rule variants. The Voyage's spirits each bend one or two of these. */
export interface Rules {
  /** Places per side of each shrine. */
  slots: number;
  /** The tide turns after this many turns (2 = once a round, 1 = every move). */
  tideEvery: number;
  /** Reserve card ids shuffled into the deck. */
  extras: number[];
  /** Extra opening cards per player, on top of the usual deal. */
  bonus: [number, number];
  /** Hide where the tide goes next (presentation only). */
  fog: boolean;
}

export const STANDARD_RULES: Rules = { slots: SLOTS, tideEvery: 2, extras: [], bonus: [0, 0], fog: false };
export const SHRINE_NAMES = ['The Grotto', 'The Lighthouse', 'The Reef'] as const;

/** Safety net: no real game comes close, but a game must always end. */
export const MAX_TURNS = 300;

export interface Seal {
  winner: PlayerId | null;
  totals: [number, number];
  phase: Phase;
}

export interface Shrine {
  phase: Phase;
  anchored: boolean;
  /** Card ids per player, in the order they were played. */
  sides: [number[], number[]];
  /** Turn number on which each side became full (null while not full). */
  filledAt: [number | null, number | null];
  sealed: Seal | null;
}

export type GameEvent =
  | { type: 'play'; player: PlayerId; cardId: number; shrine: number }
  | { type: 'pass'; player: PlayerId }
  | { type: 'flip'; shrine: number; to: Phase; cause: 'tide' | 'eclipse' | 'tidecall' }
  | { type: 'held'; shrine: number }
  | { type: 'anchor'; shrine: number }
  | { type: 'undertow'; shrine: number; player: PlayerId; cardId: number }
  | { type: 'draw'; player: PlayerId; extra: boolean }
  | { type: 'seal'; shrine: number; seal: Seal; forced: boolean }
  | { type: 'gameover'; winner: PlayerId | null };

export interface GameState {
  rules: Rules;
  deck: number[];
  hands: [number[], number[]];
  shrines: Shrine[];
  /** Shrine the tide will flip next, or null once every shrine is sealed. */
  tideMarker: number | null;
  /** Number of turns completed so far. The tide turns every `rules.tideEvery` turns. */
  turn: number;
  current: PlayerId;
  starter: PlayerId;
  /** Consecutive passes. Two in a row means nobody can move: seal everything. */
  passes: number;
  over: boolean;
  winner: PlayerId | null;
  /** What happened during the most recent move, for animation and logs. */
  events: GameEvent[];
}

export type Move = { type: 'play'; cardId: number; shrine: number } | { type: 'pass' };

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
export const flipPhase = (ph: Phase): Phase => (ph === 'sun' ? 'moon' : 'sun');

/** Small seeded PRNG (mulberry32) so games are reproducible from a seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(opts: { seed?: number; starter?: PlayerId; rules?: Partial<Rules> } = {}): GameState {
  const rules: Rules = { ...STANDARD_RULES, ...opts.rules };
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const rand = makeRng(seed);
  const deck = shuffle([...BASE_DECK, ...rules.extras], rand);

  // Random skies, but never all the same.
  let phases: Phase[];
  do {
    phases = SHRINE_NAMES.map(() => (rand() < 0.5 ? 'sun' : 'moon'));
  } while (phases.every((p) => p === phases[0]));

  const starter: PlayerId = opts.starter ?? (rand() < 0.5 ? 0 : 1);
  // Moving second is an advantage (you see more before committing and
  // place the final cards), so the starter opens with one extra card.
  const hands: [number[], number[]] = [[], []];
  const second: PlayerId = starter === 0 ? 1 : 0;
  hands[starter] = deck.splice(0, HAND_SIZE + 1 + rules.bonus[starter]);
  hands[second] = deck.splice(0, HAND_SIZE + rules.bonus[second]);

  return {
    rules,
    deck,
    hands,
    shrines: phases.map((phase) => ({
      phase,
      anchored: false,
      sides: [[], []],
      filledAt: [null, null],
      sealed: null,
    })),
    tideMarker: Math.floor(rand() * SHRINE_NAMES.length),
    turn: 0,
    current: starter,
    starter,
    passes: 0,
    over: false,
    winner: null,
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Values

export function baseValue(c: Card, phase: Phase): number {
  if (c.ability === 'twilight') return Math.max(c.sun, c.moon);
  return phase === 'sun' ? c.sun : c.moon;
}

/** Effective value of each card on one side of a shrine, in play order. */
export function sideValues(s: GameState, shrine: number, player: PlayerId, phase?: Phase): number[] {
  const sh = s.shrines[shrine];
  const ph = phase ?? sh.phase;
  const mine = sh.sides[player];
  const theirs = sh.sides[other(player)];
  const lanterns = mine.filter((id) => card(id).ability === 'lantern').length;
  let oppBest = 0;
  for (const id of theirs) {
    const c = card(id);
    if (c.ability !== 'echo') oppBest = Math.max(oppBest, baseValue(c, ph));
  }
  return mine.map((id) => {
    const c = card(id);
    const v = c.ability === 'echo' ? oppBest : baseValue(c, ph);
    return v + lanterns - (c.ability === 'lantern' ? 1 : 0);
  });
}

export function shrineTotals(s: GameState, shrine: number, phase?: Phase): [number, number] {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return [sum(sideValues(s, shrine, 0, phase)), sum(sideValues(s, shrine, 1, phase))];
}

export function shrinesWon(s: GameState): [number, number] {
  const won: [number, number] = [0, 0];
  for (const sh of s.shrines) if (sh.sealed && sh.sealed.winner !== null) won[sh.sealed.winner]++;
  return won;
}

/** How many more turns until the tide turns (1 = after the current move). */
export function turnsUntilTide(s: GameState): number {
  const every = s.rules.tideEvery;
  return every - (s.turn % every);
}

// ---------------------------------------------------------------------------
// Moves

export function legalMoves(s: GameState): Move[] {
  if (s.over) return [];
  const p = s.current;
  const moves: Move[] = [];
  for (const cardId of s.hands[p]) {
    s.shrines.forEach((sh, i) => {
      if (!sh.sealed && sh.sides[p].length < s.rules.slots) moves.push({ type: 'play', cardId, shrine: i });
    });
  }
  return moves;
}

export function canPlay(s: GameState): boolean {
  return legalMoves(s).length > 0;
}

export function applyMove(prev: GameState, move: Move): GameState {
  if (prev.over) throw new Error('Game is over');
  const s: GameState = structuredClone(prev);
  s.events = [];
  const p = s.current;

  if (move.type === 'play') {
    const sh = s.shrines[move.shrine];
    const handIdx = s.hands[p].indexOf(move.cardId);
    if (!sh || handIdx < 0 || sh.sealed || sh.sides[p].length >= s.rules.slots) {
      throw new Error(`Illegal move: ${JSON.stringify(move)}`);
    }
    s.hands[p].splice(handIdx, 1);
    sh.sides[p].push(move.cardId);
    if (sh.sides[p].length === s.rules.slots) sh.filledAt[p] = s.turn;
    s.events.push({ type: 'play', player: p, cardId: move.cardId, shrine: move.shrine });
    resolveAbility(s, p, move.cardId, move.shrine);
    s.passes = 0;
    draw(s, p, false);
  } else {
    if (canPlay(s)) throw new Error('Cannot pass while a play is available');
    s.passes++;
    s.events.push({ type: 'pass', player: p });
  }

  checkSeals(s, false);
  s.turn++;
  if (s.turn % s.rules.tideEvery === 0) tideStep(s, 'tide');
  if (s.passes >= 2 || s.turn >= MAX_TURNS) checkSeals(s, true);
  checkGameOver(s);
  s.current = other(p);
  return s;
}

function draw(s: GameState, p: PlayerId, extra: boolean) {
  const id = s.deck.shift();
  if (id === undefined) return;
  s.hands[p].push(id);
  s.events.push({ type: 'draw', player: p, extra });
}

function resolveAbility(s: GameState, p: PlayerId, cardId: number, shrine: number) {
  const sh = s.shrines[shrine];
  switch (card(cardId).ability) {
    case 'eclipse':
      if (!sh.anchored) {
        sh.phase = flipPhase(sh.phase);
        s.events.push({ type: 'flip', shrine, to: sh.phase, cause: 'eclipse' });
      } else {
        s.events.push({ type: 'held', shrine });
      }
      break;
    case 'tidecall':
      tideStep(s, 'tidecall');
      break;
    case 'anchor':
      sh.anchored = true;
      s.events.push({ type: 'anchor', shrine });
      break;
    case 'undertow': {
      // Undertows can't pull each other back, or two of them could trade
      // places forever. Every Undertow played therefore stays put, which
      // bounds the number of pulls and guarantees the game ends.
      const o = other(p);
      const newest = sh.sides[o].at(-1);
      const victim = newest !== undefined && card(newest).ability !== 'undertow' ? sh.sides[o].pop() : undefined;
      if (victim !== undefined) {
        sh.filledAt[o] = null;
        s.hands[o].push(victim);
        s.events.push({ type: 'undertow', shrine, player: o, cardId: victim });
      }
      break;
    }
    case 'drift':
      draw(s, p, true);
      break;
    default:
      break;
  }
}

function tideStep(s: GameState, cause: 'tide' | 'tidecall') {
  if (s.tideMarker === null) return;
  const i = s.tideMarker;
  const sh = s.shrines[i];
  if (!sh.sealed) {
    if (sh.anchored) {
      s.events.push({ type: 'held', shrine: i });
    } else {
      sh.phase = flipPhase(sh.phase);
      s.events.push({ type: 'flip', shrine: i, to: sh.phase, cause });
    }
  }
  advanceMarker(s);
}

function advanceMarker(s: GameState) {
  if (s.tideMarker === null) return;
  const n = s.shrines.length;
  for (let k = 1; k <= n; k++) {
    const idx = (s.tideMarker + k) % n;
    if (!s.shrines[idx].sealed) {
      s.tideMarker = idx;
      return;
    }
  }
  s.tideMarker = null;
}

function checkSeals(s: GameState, force: boolean) {
  s.shrines.forEach((sh, i) => {
    if (sh.sealed) return;
    const full = sh.sides[0].length === s.rules.slots && sh.sides[1].length === s.rules.slots;
    if (!full && !force) return;
    const totals = shrineTotals(s, i);
    let winner: PlayerId | null = null;
    if (totals[0] !== totals[1]) {
      winner = totals[0] > totals[1] ? 0 : 1;
    } else {
      // Tie: whoever completed their side first takes it.
      const [a, b] = sh.filledAt;
      if (a !== null && (b === null || a < b)) winner = 0;
      else if (b !== null && (a === null || b < a)) winner = 1;
    }
    sh.sealed = { winner, totals, phase: sh.phase };
    s.events.push({ type: 'seal', shrine: i, seal: sh.sealed, forced: force });
    if (s.tideMarker === i) advanceMarker(s);
  });
}

function checkGameOver(s: GameState) {
  const won = shrinesWon(s);
  const allSealed = s.shrines.every((sh) => sh.sealed);
  if (won[0] >= 2 || won[1] >= 2) {
    s.over = true;
    s.winner = won[0] >= 2 ? 0 : 1;
  } else if (allSealed) {
    s.over = true;
    if (won[0] !== won[1]) {
      s.winner = won[0] > won[1] ? 0 : 1;
    } else {
      // Even split: total margin across all shrines decides.
      let margin = 0;
      for (const sh of s.shrines) margin += sh.sealed!.totals[0] - sh.sealed!.totals[1];
      s.winner = margin > 0 ? 0 : margin < 0 ? 1 : null;
    }
  }
  if (s.over) s.events.push({ type: 'gameover', winner: s.winner });
}
