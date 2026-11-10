export type Phase = 'sun' | 'moon';

export type Ability =
  | 'none'
  | 'eclipse'
  | 'tidecall'
  | 'anchor'
  | 'undertow'
  | 'twilight'
  | 'lantern'
  | 'echo'
  | 'drift';

export interface Card {
  id: number;
  name: string;
  sun: number;
  moon: number;
  ability: Ability;
}

export const ABILITY_TEXT: Record<Ability, string> = {
  none: '',
  eclipse: 'Flips this shrine between sun and moon.',
  tidecall: 'Calls the tide early: the marked shrine flips now and the marker moves on.',
  anchor: "Locks this shrine's sky. Nothing can flip it again.",
  undertow: "Sends your opponent's newest card here back to their hand, unless it is an Undertow.",
  twilight: 'Always counts its higher number.',
  lantern: 'Your other cards in this shrine get +1.',
  echo: "Worth as much as your opponent's best card in this shrine, bonuses included.",
  drift: 'Draw an extra card.',
};

// Plain cards: sun + moon always sum to 10, so strength in one sky is
// weakness in the other. Names follow the day/tide they evoke.
const PLAIN: [name: string, sun: number, moon: number, copies: number][] = [
  ['Zenith', 9, 1, 2],
  ['Glare', 8, 2, 3],
  ['Daybreak', 7, 3, 3],
  ['Haze', 6, 4, 3],
  ['Equinox', 5, 5, 2],
  ['Dusk', 4, 6, 3],
  ['Ebb', 3, 7, 3],
  ['Neap', 2, 8, 3],
  ['Spring Tide', 1, 9, 2],
];

// Special cards trade raw numbers for an effect.
const SPECIAL: [name: string, ability: Ability, sun: number, moon: number][] = [
  ['Eclipse', 'eclipse', 6, 3],
  ['Eclipse', 'eclipse', 3, 6],
  ['Eclipse', 'eclipse', 5, 4],
  ['Tidecaller', 'tidecall', 5, 3],
  ['Tidecaller', 'tidecall', 3, 5],
  ['Anchor', 'anchor', 5, 4],
  ['Anchor', 'anchor', 4, 5],
  ['Undertow', 'undertow', 4, 3],
  ['Undertow', 'undertow', 3, 4],
  ['Twilight', 'twilight', 6, 2],
  ['Twilight', 'twilight', 2, 6],
  ['Lantern', 'lantern', 3, 3],
  ['Lantern', 'lantern', 3, 3],
  ['Echo', 'echo', 0, 0],
  ['Drift', 'drift', 5, 4],
  ['Drift', 'drift', 4, 5],
];

// Reserve cards are only shuffled in when a rule variant asks for them.
const RESERVE: [name: string, ability: Ability, sun: number, moon: number][] = [
  ['Eclipse', 'eclipse', 4, 5],
  ['Eclipse', 'eclipse', 6, 2],
  ['Eclipse', 'eclipse', 2, 6],
  ['Tidecaller', 'tidecall', 4, 4],
  ['Undertow', 'undertow', 5, 2],
  ['Undertow', 'undertow', 2, 5],
];

function buildCards(): Card[] {
  const cards: Card[] = [];
  for (const [name, sun, moon, copies] of PLAIN) {
    for (let i = 0; i < copies; i++) cards.push({ id: cards.length, name, sun, moon, ability: 'none' });
  }
  for (const [name, ability, sun, moon] of [...SPECIAL, ...RESERVE]) {
    cards.push({ id: cards.length, name, sun, moon, ability });
  }
  return cards;
}

export const CARDS: readonly Card[] = buildCards();

const BASE_SIZE = PLAIN.reduce((n, p) => n + p[3], 0) + SPECIAL.length;

/** The standard 40-card deck. */
export const BASE_DECK: readonly number[] = CARDS.slice(0, BASE_SIZE).map((c) => c.id);

/** Ids of reserve cards with the given ability, in order. */
export function reserve(ability: Ability, count: number): number[] {
  return CARDS.slice(BASE_SIZE)
    .filter((c) => c.ability === ability)
    .slice(0, count)
    .map((c) => c.id);
}

export const card = (id: number): Card => CARDS[id];
