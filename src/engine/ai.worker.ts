// Runs the AI off the main thread so thinking never stutters animations.
import { chooseMove, type Difficulty } from './ai';
import type { GameState, Move } from './game';

export interface ThinkRequest {
  id: number;
  state: GameState;
  difficulty: Difficulty;
}
export interface ThinkResponse {
  id: number;
  move: Move;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ThinkRequest>) => void) | null;
  postMessage(message: ThinkResponse): void;
};

scope.onmessage = (e) => {
  const { id, state, difficulty } = e.data;
  scope.postMessage({ id, move: chooseMove(state, difficulty) });
};
