import {
  applyMove,
  flipPhase,
  legalMoves,
  other,
  shrineTotals,
  shuffle,
  type GameState,
  type Move,
  type PlayerId,
} from './game';

export type Difficulty = 'novice' | 'oracle';

/** Average value a future card adds; used to price empty slots. */
const AVG_CARD = 4.6;

/**
 * Heuristic score of a position for player `me`. Roughly: +100 per shrine
 * that is (or is likely to be) ours, -100 per shrine that is theirs.
 */
export function evaluate(s: GameState, me: PlayerId): number {
  const op = other(me);
  if (s.over) return s.winner === me ? 10_000 : s.winner === op ? -10_000 : 0;

  let score = 0;
  s.shrines.forEach((sh, i) => {
    if (sh.sealed) {
      score += sh.sealed.winner === me ? 100 : sh.sealed.winner === op ? -100 : 0;
      return;
    }
    const cur = shrineTotals(s, i);
    const alt = shrineTotals(s, i, flipPhase(sh.phase));
    const myOpen = s.rules.slots - sh.sides[me].length;
    const opOpen = s.rules.slots - sh.sides[op].length;
    const open = myOpen + opOpen;

    // Chance the sky ends up flipped by the time this shrine seals. Model
    // the number of tide hits before sealing as Poisson(k); the chance of an
    // odd number of flips is (1 - e^-2k) / 2, which tends to a coin toss for
    // shrines that are far from sealing.
    let pFlip = 0;
    if (!sh.anchored) {
      const turnsLeft = open * 1.4;
      let k = turnsLeft / (3 * s.rules.tideEvery); // tide cycles 3 shrines // tide every 2 turns, cycling 3 shrines
      if (s.tideMarker === i) k += open <= 1 ? 0.25 : 0.6;
      pFlip = (1 - Math.exp(-2 * k)) / 2;
    }

    let margin = (1 - pFlip) * (cur[me] - cur[op]) + pFlip * (alt[me] - alt[op]);
    margin += (myOpen - opOpen) * AVG_CARD;
    // Ties go to whoever filled first.
    if (myOpen === 0 && opOpen > 0) margin += 0.5;
    if (opOpen === 0 && myOpen > 0) margin -= 0.5;

    const uncertainty = 1.5 + 3.2 * Math.sqrt(open);
    score += 90 * Math.tanh(margin / uncertainty);
  });

  // Holding cards is flexibility.
  score += 1.5 * (s.hands[me].length - s.hands[op].length);
  return score;
}

/**
 * Replace hidden information (opponent's hand, deck order) with one random
 * guess consistent with what `me` can see.
 */
function determinize(s: GameState, me: PlayerId, rand: () => number): GameState {
  const op = other(me);
  const unseen = shuffle([...s.hands[op], ...s.deck], rand);
  const handSize = s.hands[op].length;
  const hands: [number[], number[]] = [[], []];
  hands[me] = s.hands[me].slice();
  hands[op] = unseen.slice(0, handSize);
  return { ...s, hands, deck: unseen.slice(handSize) };
}

export function chooseMove(s: GameState, difficulty: Difficulty, rand: () => number = Math.random): Move {
  const moves = legalMoves(s);
  if (moves.length === 0) return { type: 'pass' };
  if (moves.length === 1) return moves[0];
  const me = s.current;

  if (difficulty === 'novice') {
    // Plays loosely: sometimes on a whim, otherwise a noisy greedy choice.
    if (rand() < 0.35) return moves[Math.floor(rand() * moves.length)];
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const v = evaluate(applyMove(s, m), me) + (rand() - 0.5) * 50;
      if (v > bestScore) [best, bestScore] = [m, v];
    }
    return best;
  }

  // Oracle: sample several plausible worlds, assume the opponent answers
  // each of our moves with their best reply, and pick the move that holds
  // up best on average.
  const SAMPLES = 14;
  const scores = moves.map(() => 0);
  for (let k = 0; k < SAMPLES; k++) {
    const world = determinize(s, me, rand);
    moves.forEach((m, i) => {
      const s1 = applyMove(world, m);
      if (s1.over) {
        scores[i] += evaluate(s1, me);
        return;
      }
      const replies = legalMoves(s1);
      if (replies.length === 0) {
        scores[i] += evaluate(applyMove(s1, { type: 'pass' }), me);
        return;
      }
      let worst = Infinity;
      for (const r of replies) worst = Math.min(worst, evaluate(applyMove(s1, r), me));
      scores[i] += worst;
    });
  }
  // Jitter every score once so ties are broken at random, not by move order.
  const jittered = scores.map((v) => v + rand() * 0.01);
  let bestIdx = 0;
  jittered.forEach((v, i) => {
    if (v > jittered[bestIdx]) bestIdx = i;
  });
  return moves[bestIdx];
}
