import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseMove } from '../engine/ai';
import { BASE_DECK, card } from '../engine/cards';
import { applyMove, makeRng, newGame, type GameState } from '../engine/game';
import { dailySeed, dayKey, isUnlocked, nextSpirit, seedFrom, shareText } from './meta';
import { ORACLE, SPIRITS, spiritById, type QuipKind } from './spirits';
import { load, loadRaw, remove, save } from './storage';

describe('daily tide', () => {
  it('formats the UTC date, whatever the local time zone', () => {
    expect(dayKey(new Date(Date.UTC(2026, 0, 5, 12)))).toBe('2026-01-05');
    expect(dayKey(new Date(Date.UTC(2026, 10, 8, 23, 59)))).toBe('2026-11-08');
    expect(dayKey(new Date('2026-11-08T23:30:00-05:00'))).toBe('2026-11-09');
  });

  it('gives the same seed for the same day and different seeds for different days', () => {
    const a = dailySeed(new Date(Date.UTC(2026, 10, 8, 1)));
    const b = dailySeed(new Date(Date.UTC(2026, 10, 8, 22)));
    const c = dailySeed(new Date(Date.UTC(2026, 10, 9, 1)));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(Number.isInteger(a) && a >= 0 && a < 2 ** 32).toBe(true);
  });

  it('is stable across runs (so everyone gets the same deal)', () => {
    expect(seedFrom('tidebound:2026-11-08')).toBe(seedFrom('tidebound:2026-11-08'));
    const g1 = newGame({ seed: dailySeed(new Date(Date.UTC(2026, 10, 8, 3))) });
    const g2 = newGame({ seed: dailySeed(new Date(Date.UTC(2026, 10, 8, 20))) });
    expect(g1).toEqual(g2);
  });

  it('builds a spoiler-free share line', () => {
    let g: GameState = newGame({ seed: 4 });
    const rand = makeRng(4);
    while (!g.over) g = applyMove(g, chooseMove(g, 'novice', rand));
    const text = shareText(g, '2026-11-08', 0);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Tidebound Daily Tide 2026-11-08');
    expect(lines[1]).toMatch(/^(Won|Lost|Drew) \d–\d in \d+ moves$/);
    expect(lines[2].split(' ')).toHaveLength(3);
    // no card names leak into the share text
    for (const id of BASE_DECK) expect(text).not.toContain(card(id).name);
  });
});

describe('voyage progress', () => {
  const order = ['a', 'b', 'c'];
  it('finds the next unbeaten spirit', () => {
    expect(nextSpirit(order, [])).toBe(0);
    expect(nextSpirit(order, ['a'])).toBe(1);
    expect(nextSpirit(order, ['a', 'b', 'c'])).toBe(3);
    expect(nextSpirit(order, ['b'])).toBe(0);
  });
  it('unlocks a spirit only when every earlier one is beaten', () => {
    expect(isUnlocked(order, [], 0)).toBe(true);
    expect(isUnlocked(order, [], 1)).toBe(false);
    expect(isUnlocked(order, ['a'], 1)).toBe(true);
    expect(isUnlocked(order, ['b'], 2)).toBe(false);
    expect(isUnlocked(order, ['a', 'b', 'junk'], 2)).toBe(true);
  });
});

describe('spirits', () => {
  const kinds: QuipKind[] = ['start', 'takes', 'loses', 'eclipse', 'undertow', 'win', 'lose'];

  it('each has a unique id, lines for every moment, and valid rules', () => {
    const ids = new Set<string>();
    for (const sp of [ORACLE, ...SPIRITS]) {
      expect(ids.has(sp.id)).toBe(false);
      ids.add(sp.id);
      for (const k of kinds) expect(sp.quips[k].length).toBeGreaterThan(0);
      for (const id of sp.rules.extras ?? []) {
        expect(BASE_DECK).not.toContain(id);
        expect(card(id)).toBeDefined();
      }
    }
    expect(spiritById('nope')).toBe(ORACLE);
    expect(spiritById('moth').name).toBe('The Eclipse Moth');
  });

  it("every spirit's rules produce a complete game", () => {
    for (const sp of SPIRITS) {
      let g = newGame({ seed: 2, rules: sp.rules });
      const rand = makeRng(2);
      let guard = 0;
      while (!g.over) {
        g = applyMove(g, chooseMove(g, 'novice', rand));
        if (++guard > 300) throw new Error(sp.id);
      }
      expect(g.over).toBe(true);
    }
  });

  it('the Leviathan really does hold an extra card', () => {
    const lev = spiritById('leviathan');
    const g = newGame({ seed: 1, starter: 0, rules: lev.rules });
    expect(g.hands[1].length).toBe(g.hands[0].length);
    const g2 = newGame({ seed: 1, starter: 1, rules: lev.rules });
    expect(g2.hands[1].length).toBe(g2.hands[0].length + 2);
  });
});

describe('storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeStorage(init: Record<string, string> = {}) {
    const m = new Map(Object.entries(init));
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      map: m,
    };
  }

  it('falls back when storage is missing or throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(load('x', { a: 1 })).toEqual({ a: 1 });
    expect(loadRaw('x')).toBeNull();
    expect(() => save('x', 1)).not.toThrow();
    expect(() => remove('x')).not.toThrow();
  });

  it('falls back on corrupt JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ x: '{not json' }));
    expect(load('x', { a: 1 })).toEqual({ a: 1 });
    expect(loadRaw('x')).toBeNull();
  });

  it('merges saved values over defaults and round-trips', () => {
    const fs = fakeStorage();
    vi.stubGlobal('localStorage', fs);
    save('s', { muted: true });
    expect(load('s', { muted: false, ambience: true })).toEqual({ muted: true, ambience: true });
    remove('s');
    expect(loadRaw('s')).toBeNull();
  });
});
