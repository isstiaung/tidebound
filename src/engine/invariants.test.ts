import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate } from './ai';
import { BASE_DECK, CARDS, reserve } from './cards';
import {
  applyMove,
  legalMoves,
  makeRng,
  newGame,
  shrinesWon,
  shrineTotals,
  turnsUntilTide,
  type GameState,
  type Rules,
} from './game';

const byAbility = (ability: string, n = 0) => CARDS.filter((c) => c.ability === ability)[n].id;
const plain = (sun: number, n = 0) => CARDS.filter((c) => c.ability === 'none' && c.sun === sun)[n].id;

/** A clean board: all sun, nothing played, chosen hands, tide marker on the Reef. */
function board(mut: (s: GameState) => void, rules: Partial<Rules> = {}): GameState {
  const s = newGame({ seed: 7, starter: 0, rules });
  s.shrines.forEach((sh) => {
    sh.phase = 'sun';
    sh.sides = [[], []];
  });
  s.tideMarker = 2;
  s.hands = [[], []];
  mut(s);
  // keep card conservation: anything placed by the test is removed from the deck
  const used = new Set([...s.hands[0], ...s.hands[1], ...s.shrines.flatMap((sh) => [...sh.sides[0], ...sh.sides[1]])]);
  s.deck = [...BASE_DECK, ...s.rules.extras].filter((id) => !used.has(id));
  return s;
}

/** Every card is in exactly one place, and nothing exceeds its limits. */
function checkInvariants(s: GameState) {
  const all = [
    ...s.deck,
    ...s.hands[0],
    ...s.hands[1],
    ...s.shrines.flatMap((sh) => [...sh.sides[0], ...sh.sides[1]]),
  ].sort((a, b) => a - b);
  const expected = [...BASE_DECK, ...s.rules.extras].sort((a, b) => a - b);
  expect(all).toEqual(expected);
  for (const sh of s.shrines) {
    expect(sh.sides[0].length).toBeLessThanOrEqual(s.rules.slots);
    expect(sh.sides[1].length).toBeLessThanOrEqual(s.rules.slots);
  }
  if (s.tideMarker !== null) expect(s.shrines[s.tideMarker].sealed).toBeNull();
}

describe('abilities in detail', () => {
  it('tidecall flips the marked shrine immediately and advances the marker', () => {
    const s0 = board((s) => {
      s.hands[0] = [byAbility('tidecall')];
      s.hands[1] = [plain(5)];
      s.tideMarker = 1;
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.shrines[1].phase).toBe('moon');
    expect(s1.tideMarker).toBe(2);
    expect(s1.events.some((e) => e.type === 'flip' && e.cause === 'tidecall')).toBe(true);
  });

  it('tidecall on an anchored marked shrine holds it but still moves the marker', () => {
    const s0 = board((s) => {
      s.hands[0] = [byAbility('tidecall')];
      s.shrines[1].anchored = true;
      s.tideMarker = 1;
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.shrines[1].phase).toBe('sun');
    expect(s1.tideMarker).toBe(2);
  });

  it('drift draws two cards in total', () => {
    const s0 = board((s) => {
      s.hands[0] = [byAbility('drift')];
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.hands[0]).toHaveLength(2);
    expect(s1.deck).toHaveLength(s0.deck.length - 2);
  });

  it('echo against an empty side, and echo against echo, are worth 0', () => {
    const echo = byAbility('echo');
    const s = board((s) => {
      s.shrines[0].sides[0] = [echo];
    });
    expect(shrineTotals(s, 0)).toEqual([0, 0]);
  });

  it('echo follows the sky of the shrine', () => {
    const s = board((s) => {
      s.shrines[0].sides[0] = [byAbility('echo')];
      s.shrines[0].sides[1] = [plain(9)];
    });
    expect(shrineTotals(s, 0, 'sun')[0]).toBe(9);
    expect(shrineTotals(s, 0, 'moon')[0]).toBe(1);
  });

  it("echo copies the opposing card's value with its lantern bonus", () => {
    const s = board((s) => {
      s.shrines[0].sides[0] = [byAbility('echo')];
      s.shrines[0].sides[1] = [byAbility('lantern'), plain(8)];
    });
    // their 8 counts as 9 with the lantern, so echo is 9; their total is 3 + 9
    expect(shrineTotals(s, 0)).toEqual([9, 12]);
  });

  it('two lanterns light each other', () => {
    const s = board((s) => {
      s.shrines[0].sides[0] = [byAbility('lantern', 0), byAbility('lantern', 1)];
    });
    expect(shrineTotals(s, 0)[0]).toBe(4 + 4);
  });

  it('undertow against an empty side does nothing', () => {
    const s0 = board((s) => {
      s.hands[0] = [byAbility('undertow')];
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.events.some((e) => e.type === 'undertow')).toBe(false);
  });

  it('undertow on the last open place pulls first, so the shrine does not seal', () => {
    const s0 = board((s) => {
      s.shrines[0].sides[0] = [plain(1), plain(2), plain(3)];
      s.shrines[0].sides[1] = [plain(7), plain(8), plain(9), plain(4)];
      s.shrines[0].filledAt[1] = 0;
      s.hands[0] = [byAbility('undertow')];
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.shrines[0].sealed).toBeNull();
    expect(s1.shrines[0].sides[1]).toHaveLength(3);
    expect(s1.shrines[0].filledAt[1]).toBeNull();
    expect(s1.hands[1]).toContain(plain(4));
    checkInvariants(s1);
  });

  it('undertow cannot pull back another undertow, so two of them cannot loop', () => {
    const u0 = byAbility('undertow', 0);
    const u1 = byAbility('undertow', 1);
    const s0 = board((s) => {
      s.hands[0] = [u0];
      s.hands[1] = [u1];
    });
    // player 0 plays into an empty side: nothing to pull
    const s1 = applyMove(s0, { type: 'play', cardId: u0, shrine: 0 });
    // player 1 answers with an undertow: player 0's newest is an undertow, so it stays
    const s2 = applyMove(s1, { type: 'play', cardId: u1, shrine: 0 });
    expect(s2.shrines[0].sides[0]).toContain(u0);
    expect(s2.shrines[0].sides[1]).toContain(u1);
    expect(s2.events.some((e) => e.type === 'undertow')).toBe(false);
  });

  it('a game is force-sealed at the turn cap', () => {
    const s0 = board((s) => {
      s.hands[0] = [plain(5)];
      s.turn = 299;
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    expect(s1.over).toBe(true);
    expect(s1.shrines.every((sh) => sh.sealed)).toBe(true);
  });

  it('eclipse on the final place flips before the seal', () => {
    const s0 = board((s) => {
      s.shrines[0].sides[0] = [plain(9), plain(8), plain(7)];
      s.shrines[0].sides[1] = [plain(1), plain(2), plain(3), plain(4)];
      s.shrines[0].filledAt[1] = 0;
      s.hands[0] = [byAbility('eclipse', 1)]; // 3 sun / 6 moon
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 0 });
    // under the moon: 1+2+3+6 = 12 vs 9+8+7+6 = 30 -> player 1 wins
    expect(s1.shrines[0].sealed?.phase).toBe('moon');
    expect(s1.shrines[0].sealed?.winner).toBe(1);
  });
});

describe('fog', () => {
  function tidePath(seed: number, fog: boolean): number[] {
    let s = newGame({ seed, starter: 0, rules: { fog } });
    const path = [s.tideMarker!];
    const rand = makeRng(seed);
    while (!s.over && path.length < 12) {
      const moves = legalMoves(s);
      s = applyMove(s, moves.length ? moves[Math.floor(rand() * moves.length)] : { type: 'pass' });
      if (s.tideMarker !== null && s.tideMarker !== path.at(-1)) path.push(s.tideMarker);
    }
    return path;
  }

  it('without fog the tide moves in order', () => {
    for (let seed = 0; seed < 10; seed++) {
      const p = tidePath(seed, false);
      for (let i = 1; i < p.length; i++) {
        // the next shrine in order, skipping any that sealed
        expect([(p[i - 1] + 1) % 3, (p[i - 1] + 2) % 3]).toContain(p[i]);
      }
    }
  });

  it('in fog the tide wanders, but the same seed gives the same path', () => {
    let backwards = 0;
    for (let seed = 0; seed < 30; seed++) {
      const p = tidePath(seed, true);
      expect(tidePath(seed, true)).toEqual(p);
      for (let i = 1; i < p.length; i++) if (p[i] === (p[i - 1] + 2) % 3) backwards++;
    }
    // in order, the tide never steps "backwards" while all three are open;
    // in fog it does so about half the time
    expect(backwards).toBeGreaterThan(10);
  });
});

describe('turn structure', () => {
  it('does not mutate the state it was given', () => {
    const s0 = newGame({ seed: 3 });
    const snapshot = JSON.stringify(s0);
    applyMove(s0, legalMoves(s0)[0]);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('rejects illegal moves', () => {
    const s0 = newGame({ seed: 3, starter: 0 });
    const notMine = s0.hands[1][0];
    expect(() => applyMove(s0, { type: 'play', cardId: notMine, shrine: 0 })).toThrow();
    expect(() => applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 5 })).toThrow();
    expect(() => applyMove(s0, { type: 'pass' })).toThrow();
  });

  it('cannot play into a full side or a sealed shrine', () => {
    const s0 = board((s) => {
      s.shrines[0].sides[0] = [plain(1), plain(2), plain(3), plain(4)];
      s.shrines[1].sealed = { winner: 1, totals: [0, 0], phase: 'sun' };
      s.hands[0] = [plain(5)];
    });
    const shrines = legalMoves(s0).map((m) => (m.type === 'play' ? m.shrine : -1));
    expect(shrines).toEqual([2]);
  });

  it('turnsUntilTide counts down for both tide speeds', () => {
    const s = newGame({ seed: 1 });
    expect(turnsUntilTide(s)).toBe(2);
    expect(turnsUntilTide({ ...s, turn: 1 })).toBe(1);
    const storm = newGame({ seed: 1, rules: { tideEvery: 1 } });
    expect(turnsUntilTide(storm)).toBe(1);
    expect(turnsUntilTide({ ...storm, turn: 5 })).toBe(1);
  });

  it('two passes in a row seal everything with the current totals', () => {
    const s0 = board((s) => {
      s.shrines[0].sides[0] = [plain(9)];
      s.shrines[1].sides[1] = [plain(8)];
      s.hands = [[], []];
    });
    s0.deck = [];
    const s1 = applyMove(s0, { type: 'pass' });
    expect(s1.over).toBe(false);
    const s2 = applyMove(s1, { type: 'pass' });
    expect(s2.over).toBe(true);
    expect(s2.shrines.every((sh) => sh.sealed)).toBe(true);
    expect(s2.shrines[0].sealed?.winner).toBe(0);
    expect(s2.shrines[1].sealed?.winner).toBe(1);
    expect(s2.shrines[2].sealed?.winner).toBeNull();
    // 1-1 on shrines, 9 vs 8 on totals
    expect(s2.winner).toBe(0);
  });

  it('a split with equal totals is a draw', () => {
    const s0 = board((s) => {
      s.shrines[0].sides[0] = [plain(9)];
      s.shrines[1].sides[1] = [plain(9, 1)];
    });
    s0.deck = [];
    const s2 = applyMove(applyMove(s0, { type: 'pass' }), { type: 'pass' });
    expect(s2.over).toBe(true);
    expect(s2.winner).toBeNull();
  });

  it('the game ends as soon as someone holds two shrines', () => {
    const s0 = board((s) => {
      s.shrines[0].sealed = { winner: 0, totals: [20, 10], phase: 'sun' };
      s.shrines[1].sides[0] = [plain(9), plain(8), plain(7)];
      s.shrines[1].sides[1] = [plain(1), plain(2), plain(3), plain(4)];
      s.shrines[1].filledAt[1] = 0;
      s.hands[0] = [plain(6)];
      s.tideMarker = 2;
    });
    const s1 = applyMove(s0, { type: 'play', cardId: s0.hands[0][0], shrine: 1 });
    expect(s1.over).toBe(true);
    expect(s1.winner).toBe(0);
    expect(shrinesWon(s1)).toEqual([2, 0]);
    expect(() => applyMove(s1, { type: 'pass' })).toThrow();
  });
});

describe('fuzzing every rule variant', () => {
  const variants: Partial<Rules>[] = [
    {},
    { tideEvery: 1 },
    { slots: 3 },
    { slots: 2, tideEvery: 1 },
    { extras: [...reserve('eclipse', 3), ...reserve('tidecall', 1)], fog: true },
    { extras: reserve('undertow', 2), bonus: [0, 1] },
    { extras: reserve('undertow', 2), bonus: [3, 0] },
  ];

  it('random games keep every invariant and always end', () => {
    for (const rules of variants) {
      for (let seed = 0; seed < 40; seed++) {
        const rand = makeRng(seed * 31 + 1);
        let s = newGame({ seed, rules });
        checkInvariants(s);
        let guard = 0;
        while (!s.over) {
          const moves = legalMoves(s);
          const move = moves.length ? moves[Math.floor(rand() * moves.length)] : ({ type: 'pass' } as const);
          const sealedBefore = s.shrines.map((sh) => JSON.stringify(sh.sealed && { sides: sh.sides, seal: sh.sealed }));
          s = applyMove(s, move);
          checkInvariants(s);
          // sealed shrines never change again
          s.shrines.forEach((sh, i) => {
            if (sealedBefore[i] !== 'null') expect(JSON.stringify({ sides: sh.sides, seal: sh.sealed })).toBe(sealedBefore[i]);
          });
          if (++guard > 400) throw new Error(`no end: ${JSON.stringify(rules)} seed ${seed}`);
        }
        const won = shrinesWon(s);
        if (s.winner !== null && won[0] !== won[1]) expect(won[s.winner]).toBeGreaterThan(won[1 - s.winner]);
      }
    }
  });

  it('the AI only ever chooses legal moves, in every variant', () => {
    for (const rules of variants) {
      for (let seed = 0; seed < 3; seed++) {
        const rand = makeRng(seed + 99);
        let s = newGame({ seed, rules });
        while (!s.over) {
          const m = chooseMove(s, seed % 2 ? 'oracle' : 'novice', rand);
          if (m.type === 'play') expect(legalMoves(s)).toContainEqual(m);
          else expect(legalMoves(s)).toHaveLength(0);
          s = applyMove(s, m);
        }
      }
    }
  }, 60_000);
});

describe('AI fairness', () => {
  it("does not peek at the opponent's hand or the deck order", () => {
    // Two positions that differ only in hidden information: which unseen
    // cards the human holds and how the deck is ordered.
    const base = newGame({ seed: 11, starter: 1 });
    const unseen = [...base.hands[0], ...base.deck];
    const alt: GameState = structuredClone(base);
    const shuffled = [...unseen].reverse();
    alt.hands[0] = shuffled.slice(0, base.hands[0].length);
    alt.deck = shuffled.slice(base.hands[0].length);
    expect(alt.hands[0]).not.toEqual(base.hands[0]);

    const a = chooseMove(base, 'oracle', makeRng(5));
    const b = chooseMove(alt, 'oracle', makeRng(5));
    expect(a).toEqual(b);
  });

  it('does not know where the tide goes in fog', () => {
    const base = newGame({ seed: 21, starter: 1, rules: { fog: true } });
    for (const marker of [0, 1, 2]) {
      const alt: GameState = { ...structuredClone(base), tideMarker: marker, rng: 12345 + marker };
      for (const level of ['oracle', 'novice'] as const) {
        expect(chooseMove(alt, level, makeRng(8))).toEqual(chooseMove(base, level, makeRng(8)));
      }
    }
  });

  it('scores a won game as decisively better than a lost one', () => {
    const s = newGame({ seed: 1 });
    expect(evaluate({ ...s, over: true, winner: 1 }, 1)).toBeGreaterThan(evaluate(s, 1));
    expect(evaluate({ ...s, over: true, winner: 0 }, 1)).toBeLessThan(evaluate(s, 1));
  });
});
