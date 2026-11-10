import type { Difficulty } from '../engine/ai';
import { reserve } from '../engine/cards';
import type { Rules } from '../engine/game';

export type QuipKind = 'start' | 'takes' | 'loses' | 'eclipse' | 'undertow' | 'win' | 'lose';

export interface Spirit {
  id: string;
  name: string;
  /** Mid-sentence form, e.g. "the Ferryman". */
  ref: string;
  epithet: string;
  difficulty: Difficulty;
  rules: Partial<Rules>;
  /** The rule twist, in plain words. Empty for none. */
  twist: string;
  greeting: string;
  /** Accent color for the sigil and speech. */
  hue: string;
  sigil: string;
  quips: Record<QuipKind, string[]>;
}

const sig = (body: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ORACLE: Spirit = {
  id: 'oracle',
  name: 'The Oracle',
  ref: 'the Oracle',
  epithet: 'Reader of tides',
  difficulty: 'oracle',
  rules: {},
  twist: '',
  greeting: '',
  hue: '#ee6c8a',
  sigil: sig('<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="7"/><path d="M12 32h6M46 32h6M32 12v6M32 46v6"/>'),
  quips: {
    start: ['The sea has already decided. Let us find out what.', 'Shuffle all you like. The tide remembers.', 'Begin. I have seen this game before.'],
    takes: ['As foretold.', 'That one was always mine.', 'The tide agrees with me.'],
    loses: ['A ripple. Nothing more.', 'Hm. I saw that differently.', 'Enjoy it while the water is still.'],
    eclipse: ['Let us see it in the other light.', 'Darkness, then.', 'Turn.'],
    undertow: ['Not yet. Take it back.', 'The sea returns what it does not want.', 'Again, please.'],
    win: ['The tide returns to me, as it always does.', 'Read the water next time.', 'Again?'],
    lose: ['You read the water well.', 'An unforeseen current. Well played.', 'The tide is yours. For now.'],
  },
};

export const SPIRITS: Spirit[] = [
  {
    id: 'ferryman',
    name: 'The Ferryman',
    ref: 'the Ferryman',
    epithet: 'Keeper of the crossing',
    difficulty: 'novice',
    rules: {},
    twist: 'No twist. Standard rules, to learn how the tide moves.',
    greeting: 'Every crossing starts with a coin. Yours is a card. Sit, and learn the tide.',
    hue: '#e6c27a',
    sigil: sig('<path d="M10 40h44l-6 10H16z"/><path d="M32 40V12M32 14l14 18H32"/><circle cx="20" cy="22" r="5"/>'),
    quips: {
      start: ['Mind the water. It turns when you are not looking.', 'Plenty of time. The river is long.', 'A good night for a crossing.'],
      takes: ['Fare paid.', 'Ah, that one floats my way.', 'The current favors the old man.'],
      loses: ['Well rowed.', 'You are learning quickly.', 'Mm. That stung, a little.'],
      eclipse: ['The lamp goes out, the lamp comes on.', 'Watch the sky, not my hands.', 'Now under the other light.'],
      undertow: ['Back you go.', 'Not on this boat.', 'Try that one again.'],
      win: ['Come back when the tide is kinder.', 'The river keeps its fare.', 'Rest, and try again.'],
      lose: ['You have earned your passage. Go on.', 'The far shore is yours. Mind the storms ahead.', 'Well crossed, traveller.'],
    },
  },
  {
    id: 'petrel',
    name: 'The Storm Petrel',
    ref: 'the Storm Petrel',
    epithet: 'Rider of squalls',
    difficulty: 'novice',
    rules: { tideEvery: 1 },
    twist: 'Storm tide: the tide turns after every move, not once a round. Skies change constantly.',
    greeting: 'Wind! Rain! Waves on waves! Keep up, keep up!',
    hue: '#8fd3f4',
    sigil: sig('<path d="M8 30c8-10 16-10 24 0 8-10 16-10 24 0"/><path d="M32 30v8M24 46l-4 8M34 46l-4 8M44 46l-4 8"/>'),
    quips: {
      start: ['Hold on to something!', 'Hope you like weather!', 'Every move, a new sky!'],
      takes: ['Caught it on the gust!', 'Ha! Mine on the wind!', 'Whoosh!'],
      loses: ['Blown off course!', 'Ugh, a crosswind!', 'Squalls, squalls!'],
      eclipse: ['Flip it, flip it!', 'Thunderclap!', 'More weather!'],
      undertow: ['Washed back!', 'Swept off!', 'Back in the soup!'],
      win: ['The storm wins! The storm always wins!', 'Too slow for the squall!', 'Again! Again!'],
      lose: ['Calm water? You? Impressive.', 'You rode it out. Fine. Fine!', 'The sky clears for you.'],
    },
  },
  {
    id: 'choir',
    name: 'The Drowned Choir',
    ref: 'the Drowned Choir',
    epithet: 'Voices in the shallows',
    difficulty: 'oracle',
    rules: { slots: 3 },
    twist: 'Shallows: only three places per side. Shrines seal fast, so every card counts more.',
    greeting: 'We sing the shallow songs. Short verses. Sudden endings.',
    hue: '#7fe0c4',
    sigil: sig('<path d="M20 18v24M32 12v30M44 18v24"/><path d="M14 48c6-4 12-4 18 0s12 4 18 0"/><circle cx="20" cy="16" r="2"/><circle cx="32" cy="10" r="2"/><circle cx="44" cy="16" r="2"/>'),
    quips: {
      start: ['The verse is short. Listen closely.', 'We are many. You are one.', 'Sing with us.'],
      takes: ['A chord resolves.', 'The refrain is ours.', 'In harmony.'],
      loses: ['A dissonant note.', 'One voice falters.', 'The song bends.'],
      eclipse: ['A minor key.', 'Hush. Darker now.', 'The light changes the song.'],
      undertow: ['Sing that line again.', 'From the top.', 'Not that note.'],
      win: ['The final verse is ours.', 'Join us beneath.', 'The song ends as it began.'],
      lose: ['A voice above the water. Rare.', 'You sang true.', 'The choir falls silent for you.'],
    },
  },
  {
    id: 'moth',
    name: 'The Eclipse Moth',
    ref: 'the Eclipse Moth',
    epithet: 'Eater of light',
    difficulty: 'oracle',
    rules: { extras: [...reserve('eclipse', 3), ...reserve('tidecall', 1)], fog: true },
    twist: 'Eclipse season: three extra Eclipses and a Tidecaller in the deck. Fog hides where the tide goes next.',
    greeting: 'Sun or moon, it is all the same to me. I eat them both.',
    hue: '#c6a7ff',
    sigil: sig('<path d="M32 20v28"/><path d="M32 24c-6-12-22-14-22-2s12 12 22 6M32 24c6-12 22-14 22-2s-12 12-22 6"/><path d="M32 34c-4 6-14 10-14 16M32 34c4 6 14 10 14 16"/><circle cx="32" cy="18" r="3"/>'),
    quips: {
      start: ['Can you see where the tide goes? I can.', 'So much light to eat.', 'The fog is lovely tonight.'],
      takes: ['Delicious.', 'Another light, consumed.', 'Mmm.'],
      loses: ['Bitter.', 'That one burned.', 'Too bright.'],
      eclipse: ['Dark. Light. Dark.', 'A little snack.', 'Flutter.'],
      undertow: ['Spit it out.', 'Not hungry for that one.', 'Back to you.'],
      win: ['Everything goes dark eventually.', 'I am full. Thank you.', 'Lights out.'],
      lose: ['You kept your lantern lit.', 'Fine. Keep your light.', 'I will find a dimmer flame.'],
    },
  },
  {
    id: 'leviathan',
    name: 'The Leviathan',
    ref: 'the Leviathan',
    epithet: 'The deep itself',
    difficulty: 'oracle',
    rules: { extras: reserve('undertow', 2), bonus: [0, 1] },
    twist: 'The deep pulls back: two extra Undertows in the deck, and the Leviathan holds one more card than you.',
    greeting: 'You crossed my sea. Now cross me.',
    hue: '#5fc9b5',
    sigil: sig('<path d="M6 40c6-6 12-6 18 0s12 6 18 0 10-8 16-4"/><path d="M14 34c4-14 20-22 34-14 4 2 6 6 6 10"/><circle cx="44" cy="24" r="2"/><path d="M20 30l-6-6M26 26l-4-8"/>'),
    quips: {
      start: ['The sea is mine. The cards are mine.', 'Small thing. Bold thing.', 'Begin your drowning.'],
      takes: ['Swallowed.', 'Into the deep.', 'Mine, as all water is.'],
      loses: ['A scratch on old scales.', 'You bite. Good.', 'Hmph.'],
      eclipse: ['The sky does not matter down here.', 'Turn the lights. I see in the dark.', 'Again, the sky.'],
      undertow: ['The deep pulls.', 'Nothing escapes the current.', 'Down, and back.'],
      win: ['The sea keeps what it takes.', 'Sink.', 'Every voyage ends with me.'],
      lose: ['You have crossed the whole sea. It is yours.', 'Well. The deep bows.', 'Go. Tell them the Leviathan was beaten.'],
    },
  },
];

export const spiritById = (id: string): Spirit => SPIRITS.find((s) => s.id === id) ?? ORACLE;

export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
