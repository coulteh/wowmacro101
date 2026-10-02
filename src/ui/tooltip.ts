// One shared spell popover, shown on hover and on keyboard focus.
//
// Only facts we can state truthfully: the in-game descriptions in Spell.db2 are
// templates ("Deals $s1 Frost damage"), resolved at runtime from effect values and
// caster stats we do not have. Rather than render placeholder junk or invent numbers,
// we show the placeholder-free metadata and link out to Wowhead for the rest.

import {
  formatCastTime, formatCooldown, formatRange, iconUrl, wowheadUrl, type SpellRecord,
} from '../data/spells';
import { escapeHtml } from './highlight';

export type SpellResolver = (name: string) => SpellRecord | null;

let popover: HTMLDivElement | null = null;
let shownFor: string | null = null;

function element(): HTMLDivElement {
  if (popover) return popover;
  popover = document.createElement('div');
  popover.className = 'spell-tip';
  popover.setAttribute('role', 'tooltip');
  popover.hidden = true;
  document.body.appendChild(popover);
  return popover;
}

function render(spell: SpellRecord): string {
  const icon = spell.icon
    ? `<img class="spell-tip-icon" src="${iconUrl(spell.icon, 56)}" alt="" width="40" height="40"
         onerror="this.style.visibility='hidden'">`
    : '';
  const ambiguous = spell.ambiguous
    ? `<p class="spell-tip-note">This name matches more than one spell. Showing the most
         likely one — the game picks whichever is in your spellbook.</p>`
    : '';
  return `
    <div class="spell-tip-head">${icon}<strong>${escapeHtml(spell.name)}</strong></div>
    <dl class="spell-tip-facts">
      <div><dt>Cast</dt><dd>${escapeHtml(formatCastTime(spell.castMs))}</dd></div>
      <div><dt>Range</dt><dd>${escapeHtml(formatRange(spell.rangeYd))}</dd></div>
      <div><dt>Cooldown</dt><dd>${escapeHtml(formatCooldown(spell.cooldownMs))}</dd></div>
      <div><dt>Spell ID</dt><dd>${spell.id}</dd></div>
    </dl>
    ${ambiguous}
    <a class="spell-tip-link" href="${wowheadUrl(spell.id)}" target="_blank" rel="noopener noreferrer">
      Full tooltip on Wowhead &nearr;</a>`;
}

function place(target: HTMLElement): void {
  const tip = element();
  const box = target.getBoundingClientRect();
  tip.hidden = false;
  const size = tip.getBoundingClientRect();
  const margin = 8;

  let left = box.left;
  let top = box.bottom + 6;
  // Keep it on screen: flip above if it would overflow the bottom, clamp horizontally.
  if (top + size.height > window.innerHeight - margin) top = box.top - size.height - 6;
  if (top < margin) top = margin;
  left = Math.min(left, window.innerWidth - size.width - margin);
  left = Math.max(margin, left);

  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
}

function show(target: HTMLElement, spell: SpellRecord): void {
  if (shownFor === `${target.dataset.spell}:${spell.id}`) return;
  shownFor = `${target.dataset.spell}:${spell.id}`;
  element().innerHTML = render(spell);
  place(target);
}

export function hideSpellTooltip(): void {
  if (!popover) return;
  popover.hidden = true;
  shownFor = null;
}

export function initSpellTooltip(root: HTMLElement, resolve: SpellResolver): void {
  const openFrom = (event: Event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-spell]');
    if (!target) return;
    const spell = resolve(target.dataset.spell ?? '');
    if (spell) show(target, spell);
  };

  // mouseenter does not bubble, so delegate with mouseover/mouseout.
  root.addEventListener('mouseover', openFrom);
  root.addEventListener('focusin', openFrom);
  root.addEventListener('mouseout', (event) => {
    const from = (event.target as HTMLElement | null)?.closest('[data-spell]');
    const to = (event.relatedTarget as HTMLElement | null)?.closest('[data-spell]');
    if (from && from !== to) hideSpellTooltip();
  });
  root.addEventListener('focusout', hideSpellTooltip);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideSpellTooltip();
  });
  window.addEventListener('scroll', hideSpellTooltip, { passive: true });
}
