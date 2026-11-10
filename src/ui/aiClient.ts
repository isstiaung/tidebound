// Asks the AI worker for a move, falling back to thinking on the main thread
// if workers are unavailable, crash, or take far too long.

import { chooseMove, type Difficulty } from '../engine/ai';
import type { ThinkRequest, ThinkResponse } from '../engine/ai.worker';
import type { GameState, Move } from '../engine/game';

const TIMEOUT_MS = 8000;

interface Job {
  state: GameState;
  difficulty: Difficulty;
  resolve: (m: Move) => void;
  timer: number;
}

let worker: Worker | null | undefined;
let seq = 0;
const jobs = new Map<number, Job>();

function settle(id: number, move?: Move) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  window.clearTimeout(job.timer);
  job.resolve(move ?? chooseMove(job.state, job.difficulty));
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ThinkResponse>) => settle(e.data.id, e.data.move);
    worker.onerror = () => {
      // Give up on the worker for good and finish every waiting job here.
      worker?.terminate();
      worker = null;
      for (const id of [...jobs.keys()]) settle(id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function thinkMove(state: GameState, difficulty: Difficulty): Promise<Move> {
  const w = getWorker();
  if (!w) return Promise.resolve(chooseMove(state, difficulty));
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = window.setTimeout(() => settle(id), TIMEOUT_MS);
    jobs.set(id, { state, difficulty, resolve, timer });
    w.postMessage({ id, state, difficulty } satisfies ThinkRequest);
  });
}
