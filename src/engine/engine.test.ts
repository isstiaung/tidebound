import { describe, expect, it } from 'vitest';
import { chooseMove } from './ai';
import { BASE_DECK, CARDS, reserve } from './cards';
import {
  applyMove,
  legalMoves,
  makeRng,
  newGame,
  shrineTotals,
  SLOTS,
  type GameState,
  type Move,
} from './game';

const idOf = (ability: string) => CARDS.find((c) => c.ability === ability)!.id;
void SLOTS;
const plain = (sun: number) => CARDS.find((c) => c.ability === 'none' && c.sun === sun)!.id;

/** Build a small hand-crafted position for rule tests. */
function setup(mut: (s: GameState) => void): GameState {
  const s = newGame({ seed: 1, starter: 0 });
  s.shrines.forEach((sh) => {
    sh.phase = 'sun';
    sh.sides = [[], []];
  });
  s.tideMarker = 2;
  mut(s);
  return s;
}

describe('deck', () => {
  it('has a 40-card base deck and plain cards sum to 10', () => {
    expect(BASE_DECK).toHaveLength(40);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS.filter((c) => c.ability === 'none')) expect(c.sun + c.moon).toBe(10);
  });

  it('deals 6 to the starter, 5 to the other, and keeps all cards accounted for', () => {
    const s = newGame({ seed: 42, starter: 1 });
    expect(s.hands[1]).toHaveLength(6);
    expect(s.hands[0]).toHaveLength(5);
    expect(s.deck.length + 11).toBe(40);
    const phases = new Set(s.shrines.map((sh) => sh.phase));
    expect(phases.size).toBe(2);
  });
});

describe('rules', () => {
  it('cards count the number of their shrine sky', () => {
    const s = setup((s) => {
      s.shrines[0].sides[0] = [plain(9)];
    });
    expect(shrineTotals(s, 0)[0]).toBe(9);
    expect(shrineTotals(s, 0, 'moon')[0]).toBe(1);
  });

  it('lantern buffs other cards, echo copies the best opposing card, twilight takes the max', () => {
    const lantern = idOf('lantern');
    const echo = idOf('echo');
    const twilight = CARDS.find((c) => c.ability === 'twilight' && c.sun === 2)!.id;
    const s = setup((s) => {
      s.shrines[0].sides[0] = [lantern, echo, twilight];
      s.shrines[0].sides[1] = [plain(8), plain(3)];
    });
    // lantern 3, echo 8+1, twilight 6+1
    expect(shrineTotals(s, 0)[0]).toBe(3 + 9 + 7);
  });

  it('tide flips the marked shrine after every round and moves on', () => {
    const s0 = setup((s) => {
      s.hands[0] = [plain(5)];
      s.hands[1] = [plain(5)];
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.shrines[2].phase).toBe('sun');
    const s2 = applyMove(s1, { type: 'play', cardId: s1.hands[1][0], shrine: 0 });
    expect(s2.shrines[2].phase).toBe('moon');
    expect(s2.tideMarker).toBe(0);
  });

  it('eclipse flips, anchor blocks flips', () => {
    const s0 = setup((s) => {
      s.hands[0] = [idOf('anchor')];
      s.hands[1] = [idOf('eclipse')];
      s.tideMarker = 1;
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.shrines[0].anchored).toBe(true);
    const s2 = applyMove(s1, { type: 'play', cardId: idOf('eclipse'), shrine: 0 });
    expect(s2.shrines[0].phase).toBe('sun');
  });

  it('undertow returns the newest opposing card to its owner', () => {
    const s0 = setup((s) => {
      s.hands[0] = [idOf('undertow')];
      s.shrines[0].sides[1] = [plain(9), plain(2)];
    });
    const s1 = applyMove(s0, { type: 'play', cardId: idOf('undertow'), shrine: 0 });
    expect(s1.shrines[0].sides[1]).toEqual([plain(9)]);
    expect(s1.hands[1]).toContain(plain(2));
  });

  it('a shrine seals when both sides are full, ties go to whoever filled first', () => {
    const fives = CARDS.filter((c) => c.sun === 5 && c.moon === 5 && c.ability === 'none').map((c) => c.id);
    const s0 = setup((s) => {
      const p0 = [fives[0], plain(4), plain(6), plain(3)];
      const p1 = [fives[1], plain(6), plain(4), plain(7)];
      // Remove these from wherever they were dealt so ids are unique.
      const used = new Set([...p0, ...p1]);
      s.deck = s.deck.filter((id) => !used.has(id));
      s.shrines[0].sides[0] = p0;
      s.shrines[0].sides[1] = p1.slice(0, SLOTS - 1);
      s.shrines[0].filledAt[0] = 0;
      s.hands[0] = [];
      s.hands[1] = [p1[3]];
      s.current = 1;
    });
    // p0: 5+4+6+3 = 18. p1: 5+6+4+7 = 22 => p1 wins outright.
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[1][0], shrine: 0 });
    expect(s1.shrines[0].sealed?.winner).toBe(1);
  });
});

function playOut(seed: number, ai0: 'novice' | 'oracle', ai1: 'novice' | 'oracle') {
  const rand = makeRng(seed * 7 + 3);
  let s = newGame({ seed });
  let guard = 0;
  while (!s.over) {
    const move: Move = chooseMove(s, s.current === 0 ? ai0 : ai1, rand);
    if (move.type === 'play') expect(legalMoves(s)).toContainEqual(move);
    s = applyMove(s, move);
    if (++guard > 200) throw new Error('game did not terminate');
  }
  return s;
}

describe('rule variants', () => {
  it('shallows, storm tides, extras and bonus cards all apply', () => {
    const extras = reserve('eclipse', 3);
    const s = newGame({ seed: 9, starter: 0, rules: { slots: 3, tideEvery: 1, extras, bonus: [0, 1] } });
    expect(s.deck.length + s.hands[0].length + s.hands[1].length).toBe(43);
    expect(s.hands[0]).toHaveLength(6);
    expect(s.hands[1]).toHaveLength(6);
    const before = s.shrines[s.tideMarker!].phase;
    const marked = s.tideMarker!;
    const s1 = applyMove(s, legalMoves(s)[0]);
    expect(s1.shrines[marked].phase).not.toBe(before);
  });

  it('games under every variant terminate', () => {
    const variants = [{ tideEvery: 1 }, { slots: 3 }, { extras: reserve('undertow', 2), bonus: [0, 1] as [number, number] }];
    for (const rules of variants) {
      for (let seed = 0; seed < 6; seed++) {
        const rand = makeRng(seed);
        let s = newGame({ seed, rules });
        let guard = 0;
        while (!s.over) {
          s = applyMove(s, chooseMove(s, 'novice', rand));
          if (++guard > 300) throw new Error('no end');
        }
      }
    }
  });
});

describe('full games', () => {
  it('AI vs AI games always terminate with a valid result', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = playOut(seed, 'novice', 'novice');
      expect(s.over).toBe(true);
    }
  });

  it('the Oracle beats the novice more often than not', () => {
    let oracleWins = 0;
    const N = 30;
    for (let seed = 100; seed < 100 + N; seed++) {
      const oracleSeat = (seed % 2) as 0 | 1;
      const s = playOut(seed, oracleSeat === 0 ? 'oracle' : 'novice', oracleSeat === 1 ? 'oracle' : 'novice');
      if (s.winner === oracleSeat) oracleWins++;
    }
    expect(oracleWins).toBeGreaterThan(N * 0.55);
  }, 60_000);
});
