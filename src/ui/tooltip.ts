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

/** Pointer travel time between the chip and the popover. */
const HIDE_DELAY_MS = 200;
/** Pixels between trigger and popover; kept small so the gap is easy to cross. */
const GAP = 4;

let popover: HTMLDivElement | null = null;
let shownFor: string | null = null;
let activeTrigger: HTMLElement | null = null;
let hideTimer: number | null = null;

function element(): HTMLDivElement {
  if (popover) return popover;
  popover = document.createElement('div');
  popover.className = 'spell-tip';
  popover.setAttribute('role', 'tooltip');
  popover.hidden = true;
  // Hovering or focusing the popover itself keeps it open.
  popover.addEventListener('mouseenter', cancelHide);
  popover.addEventListener('mouseleave', scheduleHide);
  popover.addEventListener('focusin', cancelHide);
  popover.addEventListener('focusout', scheduleHide);
  document.body.appendChild(popover);
  return popover;
}

function render(spell: SpellRecord, viaKeyboard: boolean): string {
  const icon = spell.icon
    ? `<img class="spell-tip-icon" src="${iconUrl(spell.icon, 56)}" alt="" width="40" height="40"
         onerror="this.style.visibility='hidden'">`
    : '';
  // Shown whenever we know it, not only on a mismatch: it informs rather than scolds.
  const owners = spell.classes.length
    ? `<p class="spell-tip-class">${escapeHtml(spell.classes.join(' / '))} ability</p>`
    : '';
  const ambiguous = spell.ambiguous
    ? `<p class="spell-tip-note">This name matches more than one spell. Showing the most
         likely one — the game picks whichever is in your spellbook.</p>`
    : '';
  return `
    <div class="spell-tip-head">${icon}<div><strong>${escapeHtml(spell.name)}</strong>${owners}</div></div>
    <dl class="spell-tip-facts">
      <div><dt>Cast</dt><dd>${escapeHtml(formatCastTime(spell.castMs))}</dd></div>
      <div><dt>Range</dt><dd>${escapeHtml(formatRange(spell.rangeYd))}</dd></div>
      <div><dt>Cooldown</dt><dd>${escapeHtml(formatCooldown(spell.cooldownMs))}</dd></div>
      <div><dt>Spell ID</dt><dd>${spell.id}</dd></div>
    </dl>
    ${ambiguous}
    <a class="spell-tip-link" href="${wowheadUrl(spell.id)}" target="_blank" rel="noopener noreferrer">
      Full tooltip on Wowhead &nearr;</a>
    ${viaKeyboard ? '<p class="spell-tip-hint">Press Enter to reach the link, Escape to close.</p>' : ''}`;
}

function place(target: HTMLElement): void {
  const tip = element();
  const box = target.getBoundingClientRect();
  tip.hidden = false;
  const size = tip.getBoundingClientRect();
  const margin = 8;

  let left = box.left;
  let top = box.bottom + GAP;
  // Keep it on screen: flip above if it would overflow the bottom, clamp horizontally.
  if (top + size.height > window.innerHeight - margin) top = box.top - size.height - GAP;
  if (top < margin) top = margin;
  left = Math.min(left, window.innerWidth - size.width - margin);
  left = Math.max(margin, left);

  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
}

function cancelHide(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/**
 * The popover lives in document.body, not inside the chip, so moving the pointer
 * towards it leaves the trigger. Without this grace period it would vanish before you
 * could reach the Wowhead link.
 */
function scheduleHide(): void {
  cancelHide();
  hideTimer = window.setTimeout(hideSpellTooltip, HIDE_DELAY_MS);
}

function show(target: HTMLElement, spell: SpellRecord, viaKeyboard = false): void {
  cancelHide();
  const key = `${target.dataset.spell}:${spell.id}:${viaKeyboard}`;
  const tip = element();
  if (shownFor === key && activeTrigger === target && !tip.hidden) return;
  shownFor = key;
  activeTrigger = target;
  tip.innerHTML = render(spell, viaKeyboard);
  place(target);
}

export function hideSpellTooltip(): void {
  cancelHide();
  activeTrigger = null;
  shownFor = null;
  if (popover) popover.hidden = true;
}

export function initSpellTooltip(root: HTMLElement, resolve: SpellResolver): void {
  const openFrom = (event: Event, viaKeyboard = false) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-spell]');
    if (!target) return;
    const spell = resolve(target.dataset.spell ?? '');
    if (spell) show(target, spell, viaKeyboard);
  };

  // mouseenter does not bubble, so delegate with mouseover/mouseout.
  root.addEventListener('mouseover', (event) => openFrom(event));
  root.addEventListener('focusin', (event) => openFrom(event, true));

  root.addEventListener('mouseout', (event) => {
    const from = (event.target as HTMLElement | null)?.closest('[data-spell]');
    if (!from) return;
    const to = event.relatedTarget as HTMLElement | null;
    // Staying on the same chip, or heading into the popover, is not a dismissal.
    if (to && (to.closest('[data-spell]') === from || popover?.contains(to))) return;
    scheduleHide();
  });

  root.addEventListener('focusout', (event) => {
    const to = event.relatedTarget as HTMLElement | null;
    if (to && popover?.contains(to)) return;
    scheduleHide();
  });

  // Enter on a focused chip moves into the popover, so the link is reachable without
  // a mouse -- the popover sits at the end of <body>, so Tab alone will not get there.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !popover || popover.hidden) return;
    if (!(event.target as HTMLElement | null)?.closest('[data-spell]')) return;
    const link = popover.querySelector<HTMLAnchorElement>('.spell-tip-link');
    if (!link) return;
    event.preventDefault();
    link.focus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !popover || popover.hidden) return;
    const trigger = activeTrigger;
    const hadFocus = popover.contains(document.activeElement);
    hideSpellTooltip();
    if (hadFocus) trigger?.focus();
  });

  // Follow the trigger rather than vanishing, so scrolling mid-read is not punished.
  window.addEventListener('scroll', () => {
    if (!popover || popover.hidden) return;
    if (activeTrigger?.isConnected) place(activeTrigger);
    else hideSpellTooltip();
  }, { passive: true });
}
