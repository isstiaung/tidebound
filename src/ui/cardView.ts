import { card, type Card, type Phase } from '../engine/cards';
import { ABILITY_ICON, ICON } from './icons';

/** Numerals are printed upside down on half the card, so 6 and 9 get an underline. */
const num = (c: Card, n: number) =>
  `<span class="num${n === 6 || n === 9 ? ' num-mark' : ''}">${c.ability === 'echo' ? '≈' : n}</span>`;

/** Build a face-up card. Sun half on top; the moon half is printed upside down. */
export function createCard(id: number): HTMLElement {
  const c = card(id);
  const el = document.createElement('div');
  el.className = `card ab-${c.ability}`;
  el.dataset.id = String(id);
  el.innerHTML = `
    <div class="card-turn">
      <div class="half half-sun">${num(c, c.sun)}${ICON.sun}</div>
      <div class="band"><span class="band-inner">${ABILITY_ICON[c.ability]}<span class="name">${c.name}</span></span></div>
      <div class="half half-moon">${num(c, c.moon)}${ICON.moon}</div>
    </div>
    <span class="eff" hidden></span>`;
  return el;
}

/** Point the card at a sky and show its effective value when modified. */
export function orientCard(el: HTMLElement, phase: Phase, effective: number | null) {
  el.classList.toggle('is-moon', phase === 'moon');
  const c = card(Number(el.dataset.id));
  const printed = c.ability === 'echo' ? null : phase === 'sun' ? c.sun : c.moon;
  const badge = el.querySelector<HTMLElement>('.eff')!;
  if (effective !== null && effective !== printed) {
    badge.hidden = false;
    badge.textContent = String(effective);
  } else {
    badge.hidden = true;
  }
}

export function createCardBack(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card card-back';
  el.innerHTML = `<div class="back-art">${ICON.sun}${ICON.moon}</div>`;
  return el;
}
