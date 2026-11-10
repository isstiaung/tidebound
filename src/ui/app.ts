import type { Difficulty } from '../engine/ai';
import { ABILITY_TEXT, BASE_DECK, card, CARDS, type Ability, type Phase } from '../engine/cards';
import {
  applyMove,
  canPlay,
  flipPhase,
  legalMoves,
  newGame,
  other,
  shrinesWon,
  shrineTotals,
  sideValues,
  SHRINE_NAMES,
  turnsUntilTide,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerId,
} from '../engine/game';
import { thinkMove } from './aiClient';
import { createCard, createCardBack, orientCard } from './cardView';
import { burstAt, flyFrom, initParticles, reducedMotion, shower, startStarfield, sweep } from './fx';
import { ABILITY_ICON, ICON } from './icons';
import { dailySeed, dayKey, isUnlocked, nextSpirit, shareText } from './meta';
import { setAmbience, setMuted, sfx } from './sound';
import { ORACLE, pick, SPIRITS, spiritById, type QuipKind, type Spirit } from './spirits';
import { load, loadRaw, remove, save } from './storage';

type Mode = 'duel' | 'voyage' | 'daily' | 'hotseat';

interface Settings {
  difficulty: Difficulty;
  muted: boolean;
  ambience: boolean;
}
interface WinRecord {
  novice: [number, number];
  oracle: [number, number];
}
interface VoyageProgress {
  beaten: string[];
}
interface DailyResult {
  verdict: 'won' | 'lost' | 'drew';
  share: string;
}
interface SavedGame {
  game: GameState;
  mode: Mode;
  spiritId: string;
  difficulty: Difficulty;
  day: string | null;
  log: string[];
}

const SAVE_KEY = 'tidebound:game:v2';
const SETTINGS_KEY = 'tidebound:settings';
const RECORD_KEY = 'tidebound:record';
const VOYAGE_KEY = 'tidebound:voyage';
const DAILY_KEY = 'tidebound:daily';
const AI_DELAY = 900;
const FLY_MS = 460;
const SETTLE_MS = 380;

const SPIRIT_ORDER = SPIRITS.map((s) => s.id);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  title: $('title'),
  voyage: $('voyage'),
  game: $('game'),
  status: $('status'),
  deck: $('deck-count'),
  shrines: $('shrines'),
  hand: $('hand'),
  oppHand: $('opp-hand'),
  detail: $('detail'),
  tideLine: $('tide-line'),
  twist: $('twist'),
  quip: $('quip'),
  log: $('log'),
  nameTop: $('name-top'),
  nameBottom: $('name-bottom'),
  sigilTop: $('sigil-top'),
  pipsTop: $('pips-top'),
  pipsBottom: $('pips-bottom'),
  handoff: $('handoff'),
  endgame: $('endgame'),
  rules: $('rules'),
};

// ---------------------------------------------------------------------------
// State

// Stored values are re-validated: they may come from older versions or be edited by hand.
const isPair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => Number.isFinite(n));
let settings: Settings = load<Settings>(SETTINGS_KEY, { difficulty: 'oracle', muted: false, ambience: true });
if (settings.difficulty !== 'novice' && settings.difficulty !== 'oracle') settings.difficulty = 'oracle';
settings.muted = settings.muted === true;
settings.ambience = settings.ambience !== false;
const storedRecord = load<WinRecord>(RECORD_KEY, { novice: [0, 0], oracle: [0, 0] });
const record: WinRecord = {
  novice: isPair(storedRecord.novice) ? storedRecord.novice : [0, 0],
  oracle: isPair(storedRecord.oracle) ? storedRecord.oracle : [0, 0],
};
const storedVoyage = load<VoyageProgress>(VOYAGE_KEY, { beaten: [] });
const voyage: VoyageProgress = {
  beaten: Array.isArray(storedVoyage.beaten) ? storedVoyage.beaten.filter((x) => typeof x === 'string') : [],
};
const storedDaily = loadRaw<Record<string, DailyResult>>(DAILY_KEY);
const daily: Record<string, DailyResult> = storedDaily && typeof storedDaily === 'object' && !Array.isArray(storedDaily) ? storedDaily : {};
setMuted(settings.muted);

let game: GameState | null = null;
let mode: Mode = 'duel';
let spirit: Spirit = ORACLE;
let difficulty: Difficulty = settings.difficulty;
let day: string | null = null;
let selected: number | null = null;
let hoverShrine: number | null = null;
let handoff = false;
let busy = false;
let log: string[] = [];
let lastPlayed: number | null = null;
let timers: number[] = [];
let voyageSel = 0;
/** Generation counter so callbacks from an abandoned game do nothing. */
let gen = 0;

/**
 * While a move's consequences play out, the board shows the sky as it was
 * before the move, and new seals stay hidden. Then everything turns at once.
 */
let stage: { phases: Phase[]; hiddenSeals: Set<number> } | null = null;
/** A card in flight from a hand to the board. */
let flight: { id: number; from: DOMRect } | null = null;
const flying = new Set<number>();

const isAI = () => mode !== 'hotseat';
/** In two-player games, whose side faces the screen. Changes only on hand-off. */
let seat: PlayerId = 0;
/** The player whose side is drawn at the bottom and whose hand is shown. */
const viewer = (): PlayerId => (isAI() ? 0 : seat);

function later(fn: () => void, ms: number) {
  const g = gen;
  const id = window.setTimeout(() => {
    timers = timers.filter((t) => t !== id);
    if (g === gen) fn();
  }, ms);
  timers.push(id);
}
function clearTimers() {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
}

// ---------------------------------------------------------------------------
// Words

const shrineName = (i: number) => SHRINE_NAMES[i];
const shrineRef = (i: number) => SHRINE_NAMES[i].replace(/^The /, 'the ');

function who(p: PlayerId): string {
  if (isAI()) return p === 0 ? 'You' : spirit.name;
  return `Player ${p + 1}`;
}
function whose(p: PlayerId): string {
  if (isAI()) return p === 0 ? 'your' : `${spirit.ref}'s`;
  return `Player ${p + 1}'s`;
}
const isYou = (p: PlayerId) => isAI() && p === 0;
const verb = (p: PlayerId, base: string, third: string) => (isYou(p) ? base : third);

function describe(e: GameEvent): string | null {
  switch (e.type) {
    case 'play':
      return `${who(e.player)} ${verb(e.player, 'play', 'plays')} ${card(e.cardId).name} to ${shrineRef(e.shrine)}.`;
    case 'pass':
      return `${who(e.player)} can't play and ${verb(e.player, 'pass', 'passes')}.`;
    case 'flip': {
      const sky = e.to === 'sun' ? 'the sun' : 'the moon';
      if (e.cause === 'tide') return `The tide flips ${shrineRef(e.shrine)} to ${sky}.`;
      if (e.cause === 'eclipse') return `Eclipse flips ${shrineRef(e.shrine)} to ${sky}.`;
      return `Tidecaller flips ${shrineRef(e.shrine)} to ${sky}.`;
    }
    case 'held':
      return `${shrineName(e.shrine)} is anchored, so the tide passes it by.`;
    case 'anchor':
      return `${shrineName(e.shrine)} is anchored. Its sky is locked.`;
    case 'undertow':
      return `Undertow pulls ${card(e.cardId).name} back to ${whose(e.player)} hand.`;
    case 'draw':
      return e.extra ? `${who(e.player)} ${verb(e.player, 'draw', 'draws')} an extra card.` : null;
    case 'seal': {
      const [a, b] = e.seal.totals;
      const w = e.seal.winner;
      if (w === null) return `${shrineName(e.shrine)} is full at ${a} to ${b}. Nobody takes it.`;
      // Winner's total first, so the line reads the same for every player.
      const score = w === 0 ? `${a} to ${b}` : `${b} to ${a}`;
      if (a === b) {
        const side = isYou(w) ? 'your' : 'their';
        return `${who(w)} ${verb(w, 'take', 'takes')} ${shrineRef(e.shrine)} on a tie (${score}) for filling ${side} side first.`;
      }
      return `${who(w)} ${verb(w, 'take', 'takes')} ${shrineRef(e.shrine)}, ${score}.`;
    }
    case 'gameover':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Flow

interface StartOpts {
  spirit?: Spirit;
  difficulty?: Difficulty;
  seed?: number;
  day?: string | null;
}

function startGame(m: Mode, opts: StartOpts = {}) {
  forfeitSavedDuel();
  abandon();
  mode = m;
  spirit = opts.spirit ?? ORACLE;
  difficulty = opts.difficulty ?? spirit.difficulty;
  day = opts.day ?? null;
  game = newGame({ seed: opts.seed, rules: isAI() ? spirit.rules : {} });
  log = [
    `${who(game.current)} ${verb(game.current, 'go', 'goes')} first and ${verb(game.current, 'get', 'gets')} an extra card.`,
  ];
  handoff = mode === 'hotseat';
  seat = game.current;
  enterGame();
  persist();
  if (isAI()) later(() => quip(spirit.greeting && mode === 'voyage' ? spirit.greeting : pick(spirit.quips.start)), 500);
  afterChange(0);
}

/** Abandoning a quick duel you've started counts as a loss, so it can't be dodged. */
function forfeits(saved: SavedGame): boolean {
  return saved.mode === 'duel' && saved.game.turn >= 2;
}

function forfeitSavedDuel() {
  const saved = loadRaw<SavedGame>(SAVE_KEY);
  if (!validSave(saved) || !forfeits(saved)) return;
  const d: Difficulty = saved.difficulty === 'novice' ? 'novice' : 'oracle';
  record[d][1]++;
  save(RECORD_KEY, record);
  remove(SAVE_KEY);
}

/** A save we can trust: right shape, unfinished, from this version. */
function validSave(saved: SavedGame | null): saved is SavedGame {
  const g = saved?.game;
  return (
    !!g &&
    typeof g === 'object' &&
    !g.over &&
    !!g.rules &&
    typeof g.rules.tideEvery === 'number' &&
    typeof g.turn === 'number' &&
    typeof g.passes === 'number' &&
    Array.isArray(g.shrines) &&
    g.shrines.length === SHRINE_NAMES.length &&
    Array.isArray(g.hands) &&
    Array.isArray(saved!.log) &&
    ['duel', 'voyage', 'daily', 'hotseat'].includes(saved!.mode)
  );
}

function resumeGame() {
  const saved = loadRaw<SavedGame>(SAVE_KEY);
  if (!validSave(saved)) return;
  abandon();
  mode = saved.mode;
  spirit = spiritById(saved.spiritId);
  difficulty = saved.difficulty === 'novice' ? 'novice' : 'oracle';
  day = saved.day;
  game = saved.game;
  game.rng ??= Math.floor(Math.random() * 2 ** 32); // saves from before fog had randomness
  log = saved.log;
  handoff = mode === 'hotseat';
  seat = game.current;
  enterGame();
  afterChange(0);
}

/** Stop everything belonging to the current game (timers, animations, drags). */
function abandon() {
  gen++;
  clearTimers();
  cancelDrag();
  toastEl()?.classList.remove('show');
  ui.quip.hidden = true;
  selected = null;
  hoverShrine = null;
  busy = false;
  lastPlayed = null;
  stage = null;
  flight = null;
  flying.clear();
}

function enterGame() {
  showScreen('game');
  ui.endgame.hidden = true;
  ui.quip.hidden = true;
  buildShrines();
  render();
  setAmbience(settings.ambience);
}

function persist() {
  if (!game) return;
  if (game.over) remove(SAVE_KEY);
  else save(SAVE_KEY, { game, mode, spiritId: spirit.id, difficulty, day, log } satisfies SavedGame);
}

function commit(move: Move, from?: DOMRect) {
  if (!game || game.over) return;
  const mover = game.current;
  const prevPhases = game.shrines.map((sh) => sh.phase);
  const prevSealed = game.shrines.map((sh) => !!sh.sealed);

  // Where the card starts its flight: the given rect, the hand card, or the
  // opponent's hand.
  if (move.type === 'play') {
    from ??= handCardRect(move.cardId) ?? lastBackRect();
    if (from) flight = { id: move.cardId, from };
  }

  game = applyMove(game, move);
  if (game.over) recordResult(game);
  const events = game.events;
  selected = null;
  hoverShrine = null;
  lastPlayed = move.type === 'play' ? move.cardId : null;
  const lines = events.map(describe).filter(Boolean) as string[];
  log.push(...lines.slice(0, 1));
  if (move.type === 'play') sfx.play();

  const motion = !reducedMotion();
  const changed = game.shrines.some((sh, i) => sh.phase !== prevPhases[i] || (!!sh.sealed && !prevSealed[i]));
  if (motion && changed) {
    stage = {
      phases: prevPhases,
      hiddenSeals: new Set(game.shrines.map((sh, i) => (sh.sealed && !prevSealed[i] ? i : -1)).filter((i) => i >= 0)),
    };
  }
  persist();
  busy = true;
  render();

  const revealAt = motion && move.type === 'play' ? FLY_MS + SETTLE_MS : 0;
  later(() => {
    stage = null;
    busy = false;
    log.push(...lines.slice(1));
    persist();
    if (mode === 'hotseat' && !game!.over) handoff = true;
    render();
    revealEvents(events, mover);
    if (game!.over) finishGame();
    else afterChange(AI_DELAY);
  }, revealAt);
}

/** The consequences of a move, shown once the played card has landed. */
function revealEvents(events: GameEvent[], mover: PlayerId) {
  const v = viewer();
  let delay = 0;
  for (const e of events) {
    const el = ui.shrines.children[(e as { shrine?: number }).shrine ?? -1] as HTMLElement | undefined;
    if (e.type === 'flip') {
      if (el) sweep(el, e.cause === 'eclipse' ? 'eclipse' : 'tide');
      later(sfx.flip, (delay += 120));
    } else if (e.type === 'undertow') {
      if (el) sweep(el, 'undertow');
      later(sfx.pull, (delay += 100));
    } else if (e.type === 'anchor' || e.type === 'held') {
      if (el) sweep(el, 'anchor');
    } else if (e.type === 'seal') {
      const mine = e.seal.winner === v;
      const good = mode === 'hotseat' ? true : mine;
      later(() => {
        sfx.seal(good);
        if (el) {
          const colors =
            e.seal.winner === null
              ? ['#8fa3c4', '#e8ecf4']
              : mine
                ? ['#5fc9b5', '#fcefcb', '#f4b942']
                : ['#ee6c8a', '#e8ecf4', '#a9bce0'];
          burstAt(el, colors);
        }
      }, (delay += 260));
    }
  }

  const notable = events
    .filter((e) => e.type !== 'play' && e.type !== 'draw' && e.type !== 'gameover' && e.type !== 'held')
    .map(describe)
    .filter(Boolean) as string[];
  if (notable.length) toast(notable.join(' '));

  // The spirit reacts.
  if (!isAI() || game?.over) return;
  let kind: QuipKind | null = null;
  for (const e of events) {
    if (e.type === 'seal' && e.seal.winner !== null) kind = e.seal.winner === 1 ? 'takes' : 'loses';
  }
  if (!kind && mover === 1) {
    if (events.some((e) => e.type === 'undertow')) kind = 'undertow';
    else if (events.some((e) => e.type === 'flip' && e.cause === 'eclipse') && Math.random() < 0.6) kind = 'eclipse';
  }
  if (kind) quip(pick(spirit.quips[kind]));
}

/** Schedule whatever happens next: the AI's move, or an automatic pass. */
function afterChange(delay: number) {
  if (!game || game.over || handoff) return;
  const aiTurn = isAI() && game.current === 1;
  if (!aiTurn && canPlay(game)) return;
  busy = true;
  render();
  // The AI thinks in a worker while the pause plays out; whichever takes
  // longer decides when the move lands. Results for an abandoned game, or a
  // position that has since changed, are dropped.
  const g = gen;
  const position = game;
  const move: Promise<Move> = aiTurn ? thinkMove(game, difficulty) : Promise.resolve({ type: 'pass' });
  const pause = new Promise<void>((resolve) => later(resolve, Math.max(delay, 500)));
  void Promise.all([move, pause]).then(([m]) => {
    if (g !== gen || game !== position || !game || game.over) return;
    commit(m);
  });
}

/**
 * Save the result the moment the game ends, before any animation, so that
 * leaving or reloading during the reveal can't lose a win (or dodge a loss).
 */
function recordResult(g: GameState) {
  if (!isAI()) return;
  const w = g.winner;
  if (mode === 'duel' && w !== null) {
    record[difficulty][w === 0 ? 0 : 1]++;
    save(RECORD_KEY, record);
  }
  if (mode === 'voyage' && w === 0 && !voyage.beaten.includes(spirit.id)) {
    voyage.beaten.push(spirit.id);
    save(VOYAGE_KEY, voyage);
  }
  if (mode === 'daily' && day && !daily[day]) {
    daily[day] = { verdict: w === 0 ? 'won' : w === 1 ? 'lost' : 'drew', share: shareText(g, day, 0) };
    save(DAILY_KEY, daily);
  }
}

function finishGame() {
  if (!game) return;
  const g = game;
  const w = g.winner;
  const won = shrinesWon(g);
  let title: string;
  let quote = '';
  const sigil = $('end-sigil');
  sigil.innerHTML = isAI() ? spirit.sigil : '';
  sigil.style.color = spirit.hue;
  $('btn-next').hidden = true;
  $('btn-share').hidden = true;
  $('end-record').textContent = '';

  if (isAI()) {
    title = w === 0 ? 'You win' : w === 1 ? `${spirit.name} wins` : "It's a draw";
    quote = w === null ? '' : `“${pick(w === 0 ? spirit.quips.lose : spirit.quips.win)}”`;
    later(() => (w === 0 ? (sfx.win(), shower(['#f4b942', '#fcefcb', '#5fc9b5', '#e8ecf4'])) : w === 1 ? sfx.lose() : undefined), 400);

    if (mode === 'duel' && w !== null) {
      $('end-record').textContent = recordLine(difficulty);
    }
    if (mode === 'voyage' && w === 0) {
      const next = nextSpirit(SPIRIT_ORDER, voyage.beaten);
      const btn = $('btn-next');
      btn.hidden = false;
      btn.textContent = next < SPIRITS.length ? `Sail on to ${SPIRITS[next].ref}` : 'See the Voyage map';
      $('end-record').textContent =
        next < SPIRITS.length ? `${voyage.beaten.length} of ${SPIRITS.length} spirits beaten.` : 'You have crossed the whole sea.';
      voyageSel = Math.min(next, SPIRITS.length - 1);
    }
    if (mode === 'daily' && day) {
      const share = shareText(g, day, 0);
      $('btn-share').hidden = false;
      $('btn-share').dataset.share = share;
      $('btn-share').textContent = 'Copy result';
      $('end-record').textContent = 'A new Daily Tide starts tomorrow (UTC).';
    }
  } else {
    title = w === null ? 'A draw' : `Player ${w + 1} wins`;
    later(() => (sfx.win(), shower(['#f4b942', '#fcefcb', '#5fc9b5', '#ee6c8a'])), 400);
  }

  const taken = (p: PlayerId) => g.shrines.map((sh, i) => (sh.sealed?.winner === p ? shrineRef(i) : null)).filter(Boolean) as string[];
  let text: string;
  if (w === null) text = 'Each side took one shrine, and the totals were equal.';
  else if (won[0] === won[1]) text = 'Each side took one shrine, so the higher total across all shrines decided the game.';
  else text = `${who(w)} took ${taken(w).join(' and ')}.`;
  $('end-title').textContent = title;
  $('end-quote').textContent = quote;
  $('end-quote').hidden = !quote;
  $('end-text').textContent = text;
  later(() => {
    ui.endgame.hidden = false;
    ($('btn-next').hidden ? ($('btn-share').hidden ? $('btn-again') : $('btn-share')) : $('btn-next')).focus();
  }, 1500);
}

function recordLine(d: Difficulty) {
  const [w, l] = record[d];
  if (w + l === 0) return '';
  return `Quick duels on ${d === 'oracle' ? 'Hard' : 'Easy'}: ${w} won, ${l} lost.`;
}

// ---------------------------------------------------------------------------
// Screens

function showScreen(which: 'title' | 'voyage' | 'game') {
  ui.title.hidden = which !== 'title';
  ui.voyage.hidden = which !== 'voyage';
  ui.game.hidden = which !== 'game';
  if (which !== 'game') toastEl()?.classList.remove('show');
  if (which === 'title') renderTitle();
  if (which === 'voyage') renderVoyage();
}

function leaveGame(to: 'title' | 'voyage') {
  abandon();
  persist();
  ui.endgame.hidden = true;
  ui.handoff.hidden = true;
  setAmbience(false);
  showScreen(to);
}

function renderTitle() {
  const saved = loadRaw<SavedGame>(SAVE_KEY);
  const resumable = validSave(saved);
  $('btn-resume').hidden = !resumable;
  const note = $('resume-note');
  note.hidden = !(resumable && forfeits(saved));
  note.textContent = 'You have a quick duel in progress. Starting any new game counts it as a loss.';
  document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => {
    const on = b.dataset.diff === settings.difficulty;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  const beaten = voyage.beaten.filter((id) => SPIRIT_ORDER.includes(id)).length;
  const next = nextSpirit(SPIRIT_ORDER, voyage.beaten);
  $('voyage-desc').textContent =
    beaten === 0
      ? 'Beat five spirits in a row. Each one changes a rule.'
      : next >= SPIRITS.length
        ? 'All five spirits beaten. Replay any of them.'
        : `${beaten} of ${SPIRITS.length} spirits beaten. Next: ${SPIRITS[next].ref}.`;
  const today = daily[dayKey(new Date())];
  $('daily-desc').textContent = today
    ? `Today's tide: you ${today.verdict}. Replay it, or come back tomorrow.`
    : 'The same deal for everyone, new every day (UTC).';
  $('record').textContent = [recordLine('novice'), recordLine('oracle')].filter(Boolean).join(' ');
}

function renderVoyage() {
  const route = $('route');
  const beatenCount = voyage.beaten.filter((id) => SPIRIT_ORDER.includes(id)).length;
  $('voyage-progress').textContent =
    beatenCount >= SPIRITS.length ? 'All five spirits beaten.' : `${beatenCount} of ${SPIRITS.length} spirits beaten`;
  const next = nextSpirit(SPIRIT_ORDER, voyage.beaten);
  route.replaceChildren(
    ...SPIRITS.map((sp, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      const beaten = voyage.beaten.includes(sp.id);
      const open = isUnlocked(SPIRIT_ORDER, voyage.beaten, i);
      b.className = `stop ${beaten ? 'beaten' : ''} ${i === next ? 'next' : ''} ${open ? '' : 'locked'} ${i === voyageSel ? 'sel' : ''}`;
      b.style.setProperty('--hue', sp.hue);
      b.setAttribute('aria-pressed', String(i === voyageSel));
      b.innerHTML = `<span class="stop-sigil">${sp.sigil}</span><span class="stop-name">${sp.name}</span><span class="stop-state">${
        beaten ? 'Beaten' : open ? 'Ready' : 'Locked'
      }</span>`;
      b.addEventListener('click', () => {
        voyageSel = i;
        renderVoyage();
      });
      li.append(b);
      return li;
    }),
  );

  const sp = SPIRITS[voyageSel];
  const open = isUnlocked(SPIRIT_ORDER, voyage.beaten, voyageSel);
  const panel = $('spirit-panel');
  panel.style.setProperty('--hue', sp.hue);
  panel.innerHTML = `
    <div class="spirit-sigil">${sp.sigil}</div>
    <div class="spirit-copy">
      <p class="spirit-epithet">${sp.epithet}</p>
      <h3>${sp.name}</h3>
      <blockquote>“${sp.greeting}”</blockquote>
      <p class="spirit-twist">${sp.twist}</p>
      <p class="spirit-strength">${sp.difficulty === 'novice' ? 'Easy opponent.' : 'Hard opponent.'}</p>
      <button class="btn btn-primary" id="btn-challenge" ${open ? '' : 'disabled'}>${
        open ? `Challenge ${sp.ref}` : `Beat ${SPIRITS[voyageSel - 1].ref} first`
      }</button>
    </div>`;
  panel.querySelector('#btn-challenge')?.addEventListener('click', () => startGame('voyage', { spirit: sp }));
}

// ---------------------------------------------------------------------------
// Board rendering

/** Card elements on the board, keyed by card id, reused so flips animate. */
const boardCards = new Map<number, HTMLElement>();

function buildShrines() {
  boardCards.clear();
  ui.shrines.innerHTML = '';
  SHRINE_NAMES.forEach((name, i) => {
    const el = document.createElement('section');
    el.className = 'shrine';
    el.dataset.i = String(i);
    el.innerHTML = `
      <div class="tide-flag" aria-hidden="true">${ICON.wave}</div>
      <div class="side side-top"></div>
      <div class="altar">
        <div class="sky" aria-hidden="true"><div class="sky-face sky-sun">${ICON.sun}</div><div class="sky-face sky-moon">${ICON.moon}</div></div>
        <div class="altar-text">
          <h3 class="altar-name">${name.replace(/^The /, '<span class="the">The </span>')}</h3>
          <p class="altar-sky"></p>
        </div>
        <div class="totals"><span class="total total-top"></span><span class="total total-bottom"></span></div>
      </div>
      <button class="side side-bottom" aria-label="Play to ${name}"></button>
      <div class="seal" hidden></div>`;
    el.querySelector<HTMLButtonElement>('.side-bottom')!.addEventListener('click', () => tryPlay(i));
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      hoverShrine = i;
      renderPreview();
    });
    el.addEventListener('pointerleave', () => {
      if (drag) return;
      if (hoverShrine === i) hoverShrine = null;
      renderPreview();
    });
    ui.shrines.append(el);
  });
}

const visualPhase = (i: number): Phase => stage?.phases[i] ?? game!.shrines[i].phase;

function syncSide(container: HTMLElement, ids: number[], values: number[], phase: Phase, slots: number) {
  const fresh: HTMLElement[] = [];
  const els = ids.map((id) => {
    let el = boardCards.get(id);
    if (!el) {
      el = createCard(id);
      el.classList.add('no-anim');
      el.addEventListener('pointerenter', () => showDetail(id));
      boardCards.set(id, el);
      fresh.push(el);
    }
    return el;
  });
  const empties = Math.max(0, slots - ids.length);
  const current = Array.from(container.children);
  const cardChildren = current.filter((c) => c.classList.contains('card'));
  const same = cardChildren.length === els.length && cardChildren.every((c, i) => c === els[i]);
  if (!same || current.length !== Math.max(slots, ids.length)) {
    const holes = Array.from({ length: empties }, () => {
      const s = document.createElement('div');
      s.className = 'slot';
      return s;
    });
    container.replaceChildren(...els, ...holes);
  }
  els.forEach((el, i) => {
    const id = Number(el.dataset.id);
    if (fresh.includes(el)) {
      if (flight && flight.id === id) {
        // Arrives upright as it was in the hand, then turns to its sky.
        orientCard(el, 'sun', null);
        flying.add(id);
        const from = flight.from;
        flight = null;
        void el.offsetWidth;
        el.classList.remove('no-anim');
        void flyFrom(el, from, FLY_MS).then(() => {
          flying.delete(id);
          render();
        });
        return;
      }
      orientCard(el, phase, values[i]);
      el.classList.add('landing');
      el.addEventListener('animationend', () => el.classList.remove('landing'), { once: true });
      void el.offsetWidth;
      el.classList.remove('no-anim');
      return;
    }
    if (!flying.has(id)) orientCard(el, phase, values[i]);
    el.classList.toggle('just-played', id === lastPlayed);
  });
}

function render() {
  if (!game) return;
  const g = game;
  const v = viewer();
  const top = other(v);
  const yourTurn = !g.over && !busy && !handoff && g.current === v && canPlay(g);

  ui.game.classList.toggle('your-turn', yourTurn);
  ui.game.classList.toggle('hotseat', mode === 'hotseat');
  ui.game.classList.toggle('fog', g.rules.fog);

  // Status line
  let status: string;
  if (g.over) status = 'Game over';
  else if (handoff) status = `${who(g.current)}, get ready`;
  else if (isAI() && g.current === 1) status = `${spirit.name} is thinking…`;
  else if (!canPlay(g)) status = `${who(g.current)} ${verb(g.current, 'have', 'has')} no move`;
  else if (busy) status = '…';
  else status = isAI() ? 'Your move' : `${who(g.current)}, your move`;
  ui.status.textContent = status;
  ui.deck.textContent = `Deck ${g.deck.length}`;

  // Names, sigil, twist, pips
  const won = shrinesWon(g);
  ui.nameTop.textContent = isAI() ? spirit.name : who(top);
  ui.nameBottom.textContent = isAI() ? 'You' : who(v);
  ui.sigilTop.innerHTML = isAI() ? spirit.sigil : '';
  ui.sigilTop.style.color = spirit.hue;
  ui.sigilTop.hidden = !isAI();
  const twist = mode === 'voyage' && spirit.twist && spirit.id !== 'ferryman' ? spirit.twist : mode === 'daily' && day ? `Daily Tide for ${day} (UTC). Everyone gets the same deal today.` : '';
  ui.twist.textContent = twist;
  ui.twist.hidden = !twist;
  ui.pipsTop.innerHTML = pips(won[top]);
  ui.pipsBottom.innerHTML = pips(won[v]);
  ui.pipsTop.setAttribute('aria-label', `${won[top]} of 2 shrines`);
  ui.pipsBottom.setAttribute('aria-label', `${won[v]} of 2 shrines`);
  $('row-top').classList.toggle('active', !g.over && g.current === top);
  $('row-bottom').classList.toggle('active', !g.over && g.current === v);

  // Opponent hand (backs)
  const oppCount = g.hands[top].length;
  if (ui.oppHand.childElementCount !== oppCount) {
    ui.oppHand.replaceChildren(...Array.from({ length: oppCount }, createCardBack));
  }
  ui.oppHand.setAttribute('aria-label', `${oppCount} cards in hand`);

  // Shrines
  const legal =
    yourTurn && selected !== null ? new Set(legalMoves(g).map((m) => (m.type === 'play' ? m.shrine : -1))) : new Set<number>();
  g.shrines.forEach((sh, i) => {
    const el = ui.shrines.children[i] as HTMLElement;
    const phase = visualPhase(i);
    const sealed = sh.sealed && !stage?.hiddenSeals.has(i) ? sh.sealed : null;
    el.classList.toggle('moon', phase === 'moon');
    el.classList.toggle('anchored', sh.anchored);
    el.classList.toggle('sealed', !!sealed);
    el.classList.toggle('legal', legal.has(i));
    const marked = g.tideMarker === i && !sh.sealed && !g.rules.fog;
    el.classList.toggle('marked', marked);
    el.classList.toggle('tide-soon', marked && turnsUntilTide(g) === 1);
    syncSide(el.querySelector('.side-top')!, sh.sides[top], sideValues(g, i, top, phase), phase, g.rules.slots);
    syncSide(el.querySelector('.side-bottom')!, sh.sides[v], sideValues(g, i, v, phase), phase, g.rules.slots);
    const totals = shrineTotals(g, i, phase);
    el.querySelector('.total-top')!.textContent = String(totals[top]);
    el.querySelector('.total-bottom')!.textContent = String(totals[v]);
    el.querySelector('.altar-sky')!.textContent = (phase === 'sun' ? 'Under the sun' : 'Under the moon') + (sh.anchored ? ', anchored' : '');
    el.querySelector<HTMLButtonElement>('.side-bottom')!.disabled = !legal.has(i);
    const seal = el.querySelector<HTMLElement>('.seal')!;
    if (sealed) {
      const w = sealed.winner;
      const cls = `seal ${w === null ? 'seal-none' : w === v ? 'seal-mine' : 'seal-theirs'}`;
      if (seal.hidden || seal.className !== cls) {
        seal.className = cls;
        seal.hidden = false;
      }
      seal.textContent = w === null ? 'No one' : isAI() ? (w === 0 ? 'Yours' : spirit.name.replace(/^The /, '')) : `Player ${w + 1}`;
    } else {
      seal.hidden = true;
    }
  });

  // Forget cards that left the board (Undertow), so a replay builds fresh.
  const onBoard = new Set(g.shrines.flatMap((sh) => [...sh.sides[0], ...sh.sides[1]]));
  for (const id of boardCards.keys()) if (!onBoard.has(id)) boardCards.delete(id);
  flight = null;

  renderTideLine();
  renderHand(yourTurn);
  renderPreview();
  renderLog();

  ui.handoff.hidden = !handoff || g.over;
  if (handoff && !g.over) {
    $('handoff-title').textContent = `${who(g.current)}, your turn`;
    if (document.activeElement !== $('btn-reveal')) later(() => $('btn-reveal').focus(), 0);
  }
}

function pips(n: number) {
  return [0, 1].map((i) => `<span class="pip ${i < n ? 'on' : ''}"></span>`).join('');
}

function renderTideLine() {
  const g = game!;
  if (g.over) {
    ui.tideLine.textContent = '';
    return;
  }
  if (g.tideMarker === null) {
    ui.tideLine.textContent = 'Every shrine is sealed.';
    return;
  }
  const n = turnsUntilTide(g);
  const mover = n === 1 ? g.current : other(g.current);
  if (g.rules.fog) {
    ui.tideLine.innerHTML = `${ICON.wave}<span>Fog hides the tide. It flips a shrine after ${whose(mover)} move.</span>`;
    return;
  }
  const held = g.shrines[g.tideMarker].anchored ? ", but it's anchored" : '';
  ui.tideLine.innerHTML = `${ICON.wave}<span>The tide flips ${shrineRef(g.tideMarker)} after ${whose(mover)} move${held}.</span>`;
}

function renderHand(yourTurn: boolean) {
  const g = game!;
  const v = viewer();
  if (handoff || (isAI() && v !== 0)) {
    ui.hand.replaceChildren();
    return;
  }
  const ids = g.hands[v];
  if (selected !== null && !ids.includes(selected)) selected = null;
  if (drag?.ghost) {
    // Don't rebuild mid-drag: touch pointers are bound to the original element.
    ui.hand.querySelectorAll<HTMLElement>('.hand-card').forEach((b) => {
      const id = Number(b.dataset.id);
      b.classList.toggle('selected', id === selected);
      b.classList.toggle('lifted', id === drag!.id);
    });
    return;
  }
  const buttons = ids.map((id, idx) => {
    const b = document.createElement('button');
    b.className = 'hand-card';
    b.dataset.id = String(id);
    const c = card(id);
    b.setAttribute('aria-label', `${idx + 1}: ${c.name}, sun ${c.sun}, moon ${c.moon}${c.ability !== 'none' ? '. ' + ABILITY_TEXT[c.ability] : ''}`);
    b.setAttribute('aria-pressed', String(selected === id));
    b.classList.toggle('selected', selected === id);
    b.classList.toggle('lifted', drag?.id === id && !!drag.ghost);
    b.disabled = !yourTurn;
    b.append(createCard(id));
    b.addEventListener('click', () => {
      if (suppressClick) return;
      selectCard(id);
    });
    b.addEventListener('pointerenter', () => showDetail(id));
    b.addEventListener('focus', () => showDetail(id));
    b.addEventListener('pointermove', (e) => tilt(b, e));
    b.addEventListener('pointerleave', () => untilt(b));
    b.addEventListener('pointerdown', (e) => beginDrag(e, id, b));
    return b;
  });
  // Keyboard players keep their place: if focus was in the hand, put it back
  // (or wait until the hand is playable again and focus it then).
  const active = document.activeElement as HTMLElement | null;
  const focusedId = active?.closest?.('.hand-card')?.getAttribute('data-id') ?? null;
  if (focusedId !== null) handFocus = true;
  else if (active && active !== document.body) handFocus = false;
  ui.hand.replaceChildren(...buttons);
  if (handFocus) {
    const again = buttons.find((b) => b.dataset.id === focusedId && !b.disabled) ?? buttons.find((b) => !b.disabled);
    again?.focus({ preventScroll: true });
  }
  if (selected !== null) showDetail(selected);
  else if (yourTurn) ui.detail.textContent = 'Drag a card to a shrine, or tap a card and then a shrine.';
  else ui.detail.textContent = '';
}

function tilt(b: HTMLElement, e: PointerEvent) {
  if (e.pointerType === 'touch' || reducedMotion()) return;
  const r = b.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  b.style.setProperty('--rx', `${(0.5 - y) * 16}deg`);
  b.style.setProperty('--ry', `${(x - 0.5) * 16}deg`);
  b.style.setProperty('--mx', `${x * 100}%`);
  b.style.setProperty('--my', `${y * 100}%`);
}
function untilt(b: HTMLElement) {
  b.style.removeProperty('--rx');
  b.style.removeProperty('--ry');
  b.style.removeProperty('--mx');
  b.style.removeProperty('--my');
}

function showDetail(id: number) {
  const c = card(id);
  const nums = c.ability === 'echo' ? 'no printed numbers' : `sun ${c.sun}, moon ${c.moon}`;
  const text = c.ability === 'none' ? '' : ` ${ABILITY_TEXT[c.ability]}`;
  ui.detail.innerHTML = `<strong>${c.name}</strong> <span class="detail-nums">${nums}.</span>${text}`;
}

function renderPreview() {
  if (!game) return;
  const g = game;
  const v = viewer();
  const top = other(v);
  ui.shrines.querySelectorAll<HTMLElement>('.shrine').forEach((el, i) => {
    const pv = el.querySelector('.totals')!;
    pv.querySelectorAll('.preview').forEach((p) => p.remove());
    el.classList.remove('previewing');
    if (selected === null || hoverShrine !== i || !el.classList.contains('legal')) return;
    const next = applyMove(g, { type: 'play', cardId: selected, shrine: i });
    // Under fog, preview the sky as it is now (plus this card's own Eclipse),
    // so the preview can't reveal which shrine the tide hits next.
    const ownFlip = next.events.some((e) => e.type === 'flip' && e.shrine === i && e.cause === 'eclipse');
    const phase = g.rules.fog && !ownFlip ? g.shrines[i].phase : ownFlip ? flipPhase(g.shrines[i].phase) : undefined;
    const t = next.shrines[i].sealed && !g.rules.fog ? next.shrines[i].sealed!.totals : shrineTotals(next, i, phase);
    el.classList.add('previewing');
    const mk = (cls: string, val: number) => {
      const s = document.createElement('span');
      s.className = `preview ${cls}`;
      s.textContent = `→ ${val}`;
      return s;
    };
    pv.querySelector('.total-top')!.after(mk('preview-top', t[top]));
    pv.querySelector('.total-bottom')!.after(mk('preview-bottom', t[v]));
  });
}

function renderLog() {
  const items = log.slice(-40).map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  });
  ui.log.replaceChildren(...items);
  ui.log.parentElement!.scrollTop = ui.log.parentElement!.scrollHeight;
}

const toastEl = () => document.querySelector<HTMLElement>('.toast');
let toastTimer: number | undefined;
function toast(text: string) {
  let el = toastEl();
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3400);
}

let quipTimer: number | undefined;
function quip(text: string) {
  if (!isAI() || !text) return;
  ui.quip.textContent = text;
  ui.quip.style.setProperty('--hue', spirit.hue);
  ui.quip.hidden = false;
  ui.quip.classList.remove('pop');
  void ui.quip.offsetWidth;
  ui.quip.classList.add('pop');
  window.clearTimeout(quipTimer);
  quipTimer = window.setTimeout(() => (ui.quip.hidden = true), 3800);
}

function handCardRect(id: number): DOMRect | undefined {
  return ui.hand.querySelector<HTMLElement>(`.hand-card[data-id="${id}"] .card`)?.getBoundingClientRect();
}
function lastBackRect(): DOMRect | undefined {
  return (ui.oppHand.lastElementChild as HTMLElement | null)?.getBoundingClientRect();
}

// ---------------------------------------------------------------------------
// Drag and drop (mouse and touch)

let drag: {
  pointer: number;
  id: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  w: number;
  ghost?: HTMLElement;
} | null = null;
let suppressClick = false;
let handFocus = false;

function beginDrag(e: PointerEvent, id: number, b: HTMLButtonElement) {
  if (b.disabled || e.button !== 0 || drag) return;
  const r = b.getBoundingClientRect();
  drag = { pointer: e.pointerId, id, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width };
  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', cancelDrag);
}

function moveDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointer) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = `${drag.w}px`;
    ghost.append(createCard(drag.id));
    document.body.append(ghost);
    drag.ghost = ghost;
    if (selected !== drag.id) {
      selected = drag.id;
      sfx.select();
    }
    render();
  }
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(${Math.max(-8, Math.min(8, (e.clientX - drag.x0) / 30))}deg)`;
  const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.shrine');
  const i = under ? Number(under.dataset.i) : null;
  if (i !== hoverShrine) {
    hoverShrine = i;
    renderPreview();
  }
}

function endDrag(e: PointerEvent) {
  const d = drag;
  if (!d || e.pointerId !== d.pointer) return;
  const ghost = d.ghost;
  const target = hoverShrine;
  const rect = ghost?.querySelector('.card')?.getBoundingClientRect();
  cancelDrag();
  if (!ghost) return;
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 0);
  if (target !== null && game && legalMoves(game).some((m) => m.type === 'play' && m.shrine === target && m.cardId === d.id)) {
    selected = d.id;
    tryPlay(target, rect);
  } else {
    render();
  }
}

function cancelDrag(e?: Event) {
  if (e instanceof PointerEvent && drag && e.pointerId !== drag.pointer) return;
  document.removeEventListener('pointermove', moveDrag);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', cancelDrag);
  drag?.ghost?.remove();
  const had = !!drag?.ghost;
  drag = null;
  if (had && game && !ui.game.hidden) render();
}

// ---------------------------------------------------------------------------
// Input

function selectCard(id: number) {
  if (!game || busy || handoff || game.over) return;
  selected = selected === id ? null : id;
  if (selected !== null) sfx.select();
  render();
}

function tryPlay(shrine: number, from?: DOMRect) {
  if (!game || busy || handoff || game.over || selected === null) return;
  const ok = legalMoves(game).some((m) => m.type === 'play' && m.shrine === shrine && m.cardId === selected);
  if (!ok) return;
  commit({ type: 'play', cardId: selected, shrine }, from);
}

function openRules() {
  ui.rules.hidden = false;
  $('btn-rules-close').focus();
}
function closeRules() {
  ui.rules.hidden = true;
}

function buildRulesAbilities() {
  const seen = new Set<Ability>();
  const dl = $('rules-abilities');
  for (const id of BASE_DECK) {
    const c = card(id);
    if (c.ability === 'none' || seen.has(c.ability)) continue;
    seen.add(c.ability);
    const copies = BASE_DECK.filter((x) => card(x).ability === c.ability).length;
    dl.insertAdjacentHTML(
      'beforeend',
      `<div class="ability"><dt>${ABILITY_ICON[c.ability]}${c.name}<span class="copies">×${copies}</span></dt><dd>${ABILITY_TEXT[c.ability]}</dd></div>`,
    );
  }
}

function buildTitleCard() {
  const holder = document.querySelector<HTMLElement>('.title-card')!;
  const el = createCard(CARDS.find((c) => c.name === 'Spring Tide')!.id);
  holder.append(el);
  holder.addEventListener('pointermove', (e) => tilt(holder, e));
  holder.addEventListener('pointerleave', () => untilt(holder));
  if (reducedMotion()) return;
  let moon = false;
  window.setInterval(() => {
    if (ui.title.hidden) return;
    moon = !moon;
    orientCard(el, moon ? 'moon' : 'sun', null);
  }, 2600);
}

function renderSoundButtons() {
  $('btn-sound').innerHTML = settings.muted ? ICON.mute : ICON.sound;
  $('btn-sound').setAttribute('aria-pressed', String(!settings.muted));
  $('btn-ambience').innerHTML = ICON.wave;
  $('btn-ambience').classList.toggle('off', !settings.ambience || settings.muted);
  $('btn-ambience').setAttribute('aria-pressed', String(settings.ambience && !settings.muted));
}

async function copyShare(btn: HTMLElement) {
  const text = btn.dataset.share ?? '';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    window.prompt('Copy your result:', text);
  }
}

export function initApp() {
  startStarfield($('stars') as HTMLCanvasElement);
  initParticles($('particles') as HTMLCanvasElement);
  buildRulesAbilities();
  buildTitleCard();
  $('btn-rules').innerHTML = ICON.book;
  $('btn-rules-close').innerHTML = ICON.close;
  renderSoundButtons();
  voyageSel = Math.min(nextSpirit(SPIRIT_ORDER, voyage.beaten), SPIRITS.length - 1);

  $('btn-play-ai').addEventListener('click', () => startGame('duel', { difficulty: settings.difficulty }));
  $('btn-play-hotseat').addEventListener('click', () => startGame('hotseat'));
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-voyage').addEventListener('click', () => showScreen('voyage'));
  $('btn-voyage-back').addEventListener('click', () => showScreen('title'));
  $('btn-daily').addEventListener('click', () => {
    const today = new Date();
    startGame('daily', { seed: dailySeed(today), day: dayKey(today), difficulty: 'oracle' });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      settings = { ...settings, difficulty: b.dataset.diff as Difficulty };
      save(SETTINGS_KEY, settings);
      renderTitle();
    }),
  );
  $('btn-rules-title').addEventListener('click', openRules);
  $('btn-rules').addEventListener('click', openRules);
  $('btn-rules-close').addEventListener('click', closeRules);
  ui.rules.addEventListener('click', (e) => {
    if (e.target === ui.rules) closeRules();
  });
  $('btn-sound').addEventListener('click', () => {
    settings = { ...settings, muted: !settings.muted };
    setMuted(settings.muted);
    save(SETTINGS_KEY, settings);
    if (!settings.muted && !ui.game.hidden) setAmbience(settings.ambience);
    renderSoundButtons();
  });
  $('btn-ambience').addEventListener('click', () => {
    settings = { ...settings, ambience: !settings.ambience };
    save(SETTINGS_KEY, settings);
    setAmbience(settings.ambience);
    renderSoundButtons();
  });
  $('btn-menu').addEventListener('click', () => leaveGame(mode === 'voyage' ? 'voyage' : 'title'));
  $('btn-reveal').addEventListener('click', () => {
    handoff = false;
    if (game) seat = game.current;
    render();
    afterChange(0);
  });
  $('btn-again').addEventListener('click', () => {
    if (mode === 'voyage') startGame('voyage', { spirit });
    else if (mode === 'daily') {
      const today = new Date();
      startGame('daily', { seed: dailySeed(today), day: dayKey(today), difficulty: 'oracle' });
    } else startGame(mode, { difficulty: mode === 'duel' ? settings.difficulty : undefined });
  });
  $('btn-next').addEventListener('click', () => leaveGame('voyage'));
  $('btn-share').addEventListener('click', (e) => void copyShare(e.currentTarget as HTMLElement));
  $('btn-board').addEventListener('click', () => (ui.endgame.hidden = true));
  $('btn-title').addEventListener('click', () => leaveGame('title'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (drag) {
        cancelDrag();
        selected = null;
        render();
      } else if (!ui.rules.hidden) closeRules();
      else if (selected !== null) {
        selected = null;
        render();
      }
      return;
    }
    if (ui.game.hidden || !game || !ui.rules.hidden || !ui.endgame.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = e.key === '0' ? 10 : Number(e.key);
    if (n >= 1 && n <= 10) {
      const id = game.hands[viewer()][n - 1];
      if (id !== undefined) selectCard(id);
    }
    const shrine = ({ q: 0, w: 1, e: 2 } as Record<string, number>)[e.key.toLowerCase()];
    if (shrine !== undefined) tryPlay(shrine);
  });

  showScreen('title');
}
