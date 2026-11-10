// Pure helpers for the Daily Tide and the Voyage. No DOM, so they're unit-tested.

import type { GameState, PlayerId } from '../engine/game';

/**
 * UTC calendar date as YYYY-MM-DD. UTC (not local time) so that everyone
 * playing at the same moment gets the same deal, whatever their time zone.
 */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Stable 32-bit seed from a string (FNV-1a). Same day, same deal, everywhere. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const dailySeed = (d: Date) => seedFrom(`tidebound:${dayKey(d)}`);

/** Spoiler-free result to paste anywhere: one sky and one verdict per shrine. */
export function shareText(g: GameState, day: string, you: PlayerId = 0): string {
  const won = g.shrines.filter((sh) => sh.sealed?.winner === you).length;
  const lost = g.shrines.filter((sh) => sh.sealed && sh.sealed.winner !== null && sh.sealed.winner !== you).length;
  const verdict = g.winner === you ? 'Won' : g.winner === null ? 'Drew' : 'Lost';
  const row = g.shrines
    .map((sh) => {
      const sky = (sh.sealed?.phase ?? sh.phase) === 'sun' ? '☀️' : '🌙';
      const mark = !sh.sealed ? '⬜' : sh.sealed.winner === you ? '🟩' : sh.sealed.winner === null ? '⬜' : '🟥';
      return sky + mark;
    })
    .join(' ');
  return `Tidebound Daily Tide ${day}\n${verdict} ${won}–${lost} in ${g.turn} moves\n${row}`;
}

/** Index of the first spirit not yet beaten (equals `order.length` when all are). */
export function nextSpirit(order: string[], beaten: string[]): number {
  const i = order.findIndex((id) => !beaten.includes(id));
  return i < 0 ? order.length : i;
}

/** A spirit can be challenged once everything before it is beaten. */
export function isUnlocked(order: string[], beaten: string[], index: number): boolean {
  return order.slice(0, index).every((id) => beaten.includes(id));
}
